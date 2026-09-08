import { AsyncLocalStorage } from 'async_hooks';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL } from './schema';

export class DatabaseDurabilityError extends Error {
  public readonly code = 'DATABASE_DURABILITY_FAILED';
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'DatabaseDurabilityError'; }
}

export class DatabaseCorruptionError extends Error {
  public readonly code = 'DATABASE_CORRUPTION';
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'DatabaseCorruptionError'; }
}

export class DatabaseAlreadyInUseError extends Error {
  public readonly code = 'DATABASE_ALREADY_IN_USE';
  constructor(message: string) { super(message); this.name = 'DatabaseAlreadyInUseError'; }
}

export interface DatabaseManagerOptions { databasePath?: string; }
interface DatabaseOperationContext { inTransaction: boolean; }

const DEFAULT_DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'aetheria.db');

/** SQL.js has one in-memory database; this class makes every visible operation exclusive. */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: SqlJsDatabase | null = null;
  private sql: SqlJsStatic | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly operationContext = new AsyncLocalStorage<DatabaseOperationContext>();
  private readonly databasePath: string;
  private readonly lockPath: string;
  private ownsProcessLock = false;
  private persistenceFaultForTest: Error | null = null;

  public constructor(options: DatabaseManagerOptions = {}) {
    this.databasePath = options.databasePath || DEFAULT_DATABASE_PATH;
    this.lockPath = `${this.databasePath}.lock`;
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) DatabaseManager.instance = new DatabaseManager();
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized && this.db) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    return this.initializationPromise;
  }

  private async initializeOnce(): Promise<void> {
    const directory = path.dirname(this.databasePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    this.acquireProcessLock();
    try {
      this.sql = await initSqlJs();
      this.db = this.openDurableDatabaseOrRecover(this.sql);
      this.db.exec(CREATE_TABLES_SQL);
      this.migrateObservedHistoryPointUniqueness();
      this.applyMigrations();
      this.initialized = true;
      this.persistOrRestore();
      console.log(`[DatabaseManager] WASM SQLite database initialized at ${this.databasePath}`);
    } catch (error) {
      this.db?.close();
      this.db = null;
      this.sql = null;
      this.initialized = false;
      this.releaseProcessLock();
      throw error;
    }
  }

  private openDurableDatabaseOrRecover(SQL: SqlJsStatic): SqlJsDatabase {
    if (!fs.existsSync(this.databasePath)) return new SQL.Database();
    try {
      return this.openAndValidate(SQL, this.databasePath);
    } catch (primaryError) {
      const backupPath = `${this.databasePath}.bak`;
      if (fs.existsSync(backupPath)) {
        try {
          const recovered = this.openAndValidate(SQL, backupPath);
          fs.copyFileSync(backupPath, this.databasePath);
          console.error('[DatabaseManager] Recovered corrupt primary database from retained backup.');
          return recovered;
        } catch (backupError) {
          throw new DatabaseCorruptionError('Primary and retained backup databases failed integrity validation.', { primaryError, backupError });
        }
      }
      throw new DatabaseCorruptionError('Primary database failed integrity validation and no valid backup exists.', primaryError);
    }
  }

  private openAndValidate(SQL: SqlJsStatic, filePath: string): SqlJsDatabase {
    const db = new SQL.Database(fs.readFileSync(filePath));
    try {
      const integrity = db.exec('PRAGMA integrity_check;');
      const value = integrity[0]?.values[0]?.[0];
      if (value !== 'ok') throw new Error(`PRAGMA integrity_check returned ${String(value)}`);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private applyMigrations(): void {
    if (!this.db) return;
    const migrations = [
      "ALTER TABLE characters ADD COLUMN presence_state TEXT NOT NULL DEFAULT 'AT_LOCATION';",
      'ALTER TABLE characters ADD COLUMN current_transaction_id TEXT;',
      'ALTER TABLE world_transactions ADD COLUMN completed_epoch INTEGER;',
      'ALTER TABLE world_transactions ADD COLUMN last_valid_location_id TEXT;',
      'ALTER TABLE scheduled_checkpoints ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;',
      "ALTER TABLE locations ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';",
      'ALTER TABLE dependency_edges ADD COLUMN expected_condition_json TEXT;',
      "ALTER TABLE dependency_edges ADD COLUMN failure_policy TEXT NOT NULL DEFAULT 'FAIL_SOURCE';",
      "ALTER TABLE dependency_edges ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';",
      'ALTER TABLE dependency_edges ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;',
      'ALTER TABLE dependency_edges ADD COLUMN created_at_epoch INTEGER NOT NULL DEFAULT 1;',
      'ALTER TABLE dependency_edges ADD COLUMN last_evaluated_epoch INTEGER;',
      'ALTER TABLE dependency_edges ADD COLUMN invalidated_at_epoch INTEGER;',
      'ALTER TABLE dependency_edges ADD COLUMN invalidation_reason TEXT;',
      'ALTER TABLE dependency_edges ADD COLUMN metadata_json TEXT;',
      "ALTER TABLE worlds ADD COLUMN world_creation_state TEXT NOT NULL DEFAULT 'CREATED';",
    ];
    for (const sql of migrations) {
      try { this.db.exec(sql); } catch (error) { if (!this.isDuplicateColumnError(error)) throw error; }
    }
  }

  private isDuplicateColumnError(error: unknown): boolean {
    return /duplicate column name|already exists/i.test(error instanceof Error ? error.message : String(error));
  }

  private migrateObservedHistoryPointUniqueness(): void {
    if (!this.db) return;
    const result = this.db.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'observed_history'");
    const tableSql = result[0]?.values[0]?.[0];
    if (typeof tableSql !== 'string' || !/UNIQUE\s*\(\s*world_id\s*,\s*observer_type\s*,\s*observer_id\s*,\s*subject_type\s*,\s*subject_id\s*,\s*observed_epoch\s*,\s*fact_path\s*\)/i.test(tableSql)) return;
    this.db.exec(`
      ALTER TABLE observed_history RENAME TO observed_history_legacy;
      CREATE TABLE observed_history (
        id TEXT PRIMARY KEY, world_id TEXT NOT NULL, observer_type TEXT NOT NULL, observer_id TEXT NOT NULL,
        subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, observation_type TEXT NOT NULL,
        observed_epoch INTEGER NOT NULL, recorded_epoch INTEGER NOT NULL, fact_path TEXT NOT NULL,
        observed_value_json TEXT, confidence REAL NOT NULL DEFAULT 1.0, source_event_id TEXT,
        source_transaction_id TEXT, visibility TEXT NOT NULL DEFAULT 'PRIVATE',
        immutable_history INTEGER NOT NULL DEFAULT 1, metadata_json TEXT,
        FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
      );
      INSERT INTO observed_history (
        id, world_id, observer_type, observer_id, subject_type, subject_id, observation_type,
        observed_epoch, recorded_epoch, fact_path, observed_value_json, confidence, source_event_id,
        source_transaction_id, visibility, immutable_history, metadata_json
      ) SELECT
        id, world_id, observer_type, observer_id, subject_type, subject_id, observation_type,
        observed_epoch, recorded_epoch, fact_path, observed_value_json, confidence, source_event_id,
        source_transaction_id, visibility, immutable_history, metadata_json
      FROM observed_history_legacy;
      DROP TABLE observed_history_legacy;
    `);
  }

  public setPersistenceFaultForTest(error: Error | null): void { this.persistenceFaultForTest = error; }

  public async flush(): Promise<void> {
    await this.initializeIfNeededForFlush();
    if (this.operationContext.getStore()?.inTransaction) return;
    await this.withExclusiveOperation(async () => this.persistOrRestore());
  }

  private async initializeIfNeededForFlush(): Promise<void> {
    if (!this.initialized || !this.db) {
      if (this.initializationPromise) await this.initializationPromise;
      if (!this.initialized || !this.db) throw new Error('Database not initialized');
    }
  }

  private persistOrRestore(): void {
    if (!this.db) throw new Error('Database not initialized');
    try {
      if (this.persistenceFaultForTest) {
        const error = this.persistenceFaultForTest;
        this.persistenceFaultForTest = null;
        throw error;
      }
      const temporaryPath = path.join(path.dirname(this.databasePath), `.${path.basename(this.databasePath)}.${process.pid}.${Date.now()}.tmp`);
      try {
        const descriptor = fs.openSync(temporaryPath, 'w');
        try {
          fs.writeFileSync(descriptor, Buffer.from(this.db.export()));
          fs.fsyncSync(descriptor);
        } finally { fs.closeSync(descriptor); }
        if (fs.existsSync(this.databasePath)) fs.copyFileSync(this.databasePath, `${this.databasePath}.bak`);
        fs.renameSync(temporaryPath, this.databasePath);
      } finally {
        if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
      }
    } catch (error) {
      try { this.restoreLastDurableDatabase(); }
      catch (restoreError) { throw new DatabaseDurabilityError('Database persistence failed and durable recovery failed.', { error, restoreError }); }
      throw new DatabaseDurabilityError('Database persistence failed; in-memory state was restored to durable state.', error);
    }
  }

  private restoreLastDurableDatabase(): void {
    if (!this.sql || !fs.existsSync(this.databasePath)) throw new Error('No durable database is available for recovery');
    const restored = this.openAndValidate(this.sql, this.databasePath);
    this.db?.close();
    this.db = restored;
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    await this.initialize();
    return this.withOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      this.db.run(sql, params);
      const changes = this.db.getRowsModified();
      if (!this.operationContext.getStore()?.inTransaction) this.persistOrRestore();
      return { changes };
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    await this.initialize();
    return this.withOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      const stmt = this.db.prepare(sql);
      try { stmt.bind(params); return stmt.step() ? stmt.getAsObject() as T : undefined; } finally { stmt.free(); }
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.initialize();
    return this.withOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      const result: T[] = [];
      const stmt = this.db.prepare(sql);
      try { stmt.bind(params); while (stmt.step()) result.push(stmt.getAsObject() as T); } finally { stmt.free(); }
      return result;
    });
  }

  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.initialize();
    if (this.operationContext.getStore()?.inTransaction) return callback();
    return this.withExclusiveOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      return this.operationContext.run({ inTransaction: true }, async () => {
        this.db!.exec('BEGIN TRANSACTION;');
        try {
          const result = await callback();
          this.db!.exec('COMMIT;');
          this.persistOrRestore();
          return result;
        } catch (error) {
          try { this.db!.exec('ROLLBACK;'); } catch { /* post-commit durability failure has already reloaded durable state */ }
          throw error;
        }
      });
    });
  }

  private async withOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    return this.operationContext.getStore()?.inTransaction ? operation() : this.withExclusiveOperation(operation);
  }

  private async withExclusiveOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const ownTurn = new Promise<void>((resolve) => { release = resolve; });
    const priorTurn = this.operationQueue;
    this.operationQueue = ownTurn;
    await priorTurn;
    try { return await operation(); } finally { release(); }
  }

  private acquireProcessLock(): void {
    const contents = JSON.stringify({ pid: process.pid, startedAt: Date.now() });
    try {
      fs.writeFileSync(this.lockPath, contents, { flag: 'wx' });
      this.ownsProcessLock = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (this.isStaleLock()) {
      fs.rmSync(this.lockPath, { force: true });
      fs.writeFileSync(this.lockPath, contents, { flag: 'wx' });
      this.ownsProcessLock = true;
      return;
    }
    throw new DatabaseAlreadyInUseError(`Database is already owned by another live process: ${this.databasePath}`);
  }

  private isStaleLock(): boolean {
    try {
      const lock = JSON.parse(fs.readFileSync(this.lockPath, 'utf8')) as { pid?: number };
      if (!lock.pid || lock.pid === process.pid) return false;
      process.kill(lock.pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH' || error instanceof SyntaxError;
    }
  }

  private releaseProcessLock(): void {
    if (this.ownsProcessLock) fs.rmSync(this.lockPath, { force: true });
    this.ownsProcessLock = false;
  }

  public async close(): Promise<void> {
    if (!this.db) return;
    await this.flush();
    this.db.close();
    this.db = null;
    this.sql = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.releaseProcessLock();
  }
}

export function createDatabaseManager(options: DatabaseManagerOptions = {}): DatabaseManager { return new DatabaseManager(options); }
export const dbManager = DatabaseManager.getInstance();
