import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL } from './schema';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'aetheria.db');

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: SqlJsDatabase | null = null;
  private initialized = false;
  private inTransaction = false;
  private transactionQueue: Promise<void> = Promise.resolve();

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized && this.db) return;

    const SQL = await initSqlJs();

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const filebuffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(filebuffer);
        this.db.exec('PRAGMA schema_version;');
      } catch (err) {
        console.warn(`[DatabaseManager] Existing DB at ${DB_PATH} is malformed. Archiving corrupt DB...`, err);
        try {
          const corruptBackupPath = `${DB_PATH}.corrupt-${Date.now()}`;
          fs.renameSync(DB_PATH, corruptBackupPath);
          console.warn(`[DatabaseManager] Corrupt DB archived to ${corruptBackupPath}`);
        } catch (_) {}
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    this.db.exec(CREATE_TABLES_SQL);
    this.migrateObservedHistoryPointUniqueness();

    const migrations = [
      "ALTER TABLE characters ADD COLUMN presence_state TEXT NOT NULL DEFAULT 'AT_LOCATION';",
      "ALTER TABLE characters ADD COLUMN current_transaction_id TEXT;",
      "ALTER TABLE world_transactions ADD COLUMN completed_epoch INTEGER;",
      "ALTER TABLE world_transactions ADD COLUMN last_valid_location_id TEXT;",
      "ALTER TABLE scheduled_checkpoints ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE locations ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';",
      "ALTER TABLE dependency_edges ADD COLUMN expected_condition_json TEXT;",
      "ALTER TABLE dependency_edges ADD COLUMN failure_policy TEXT NOT NULL DEFAULT 'FAIL_SOURCE';",
      "ALTER TABLE dependency_edges ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';",
      "ALTER TABLE dependency_edges ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE dependency_edges ADD COLUMN created_at_epoch INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE dependency_edges ADD COLUMN last_evaluated_epoch INTEGER;",
      "ALTER TABLE dependency_edges ADD COLUMN invalidated_at_epoch INTEGER;",
      "ALTER TABLE dependency_edges ADD COLUMN invalidation_reason TEXT;",
      "ALTER TABLE dependency_edges ADD COLUMN metadata_json TEXT;",
      "ALTER TABLE worlds ADD COLUMN world_creation_state TEXT NOT NULL DEFAULT 'CREATED';",
    ];
    for (const sql of migrations) {
      try {
        this.db.exec(sql);
      } catch (_) {
        // Column may already exist
      }
    }

    this.saveToDisk();
    this.initialized = true;
    console.log(`[DatabaseManager] WASM SQLite database initialized at ${DB_PATH}`);
  }

  /**
   * Earlier schemas used a natural-point UNIQUE constraint. That prevented two
   * distinct dialogue claims in the same epoch. Immutable confirmed facts are
   * now protected by repository policy instead, while claims remain append-only.
   */
  private migrateObservedHistoryPointUniqueness(): void {
    if (!this.db) return;
    const result = this.db.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'observed_history'");
    const tableSql = result[0]?.values[0]?.[0];
    if (typeof tableSql !== 'string' || !/UNIQUE\s*\(\s*world_id\s*,\s*observer_type\s*,\s*observer_id\s*,\s*subject_type\s*,\s*subject_id\s*,\s*observed_epoch\s*,\s*fact_path\s*\)/i.test(tableSql)) return;
    this.db.exec(`
      ALTER TABLE observed_history RENAME TO observed_history_legacy;
      CREATE TABLE observed_history (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        observer_type TEXT NOT NULL,
        observer_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        observation_type TEXT NOT NULL,
        observed_epoch INTEGER NOT NULL,
        recorded_epoch INTEGER NOT NULL,
        fact_path TEXT NOT NULL,
        observed_value_json TEXT,
        confidence REAL NOT NULL DEFAULT 1.0,
        source_event_id TEXT,
        source_transaction_id TEXT,
        visibility TEXT NOT NULL DEFAULT 'PRIVATE',
        immutable_history INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT,
        FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
      );
      INSERT INTO observed_history SELECT * FROM observed_history_legacy;
      DROP TABLE observed_history_legacy;
    `);
  }

  private saveToDisk(): void {
    if (!this.db || this.inTransaction) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error('[DatabaseManager] Failed to persist WASM database to disk:', err);
    }
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    this.saveToDisk();
    return { changes };
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let result: T | undefined = undefined;
    if (stmt.step()) {
      result = stmt.getAsObject() as T;
    }
    stmt.free();
    return result;
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const results: T[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    let resolveLock!: () => void;
    const lock = new Promise<void>((res) => {
      resolveLock = res;
    });
    const previousQueue = this.transactionQueue;
    this.transactionQueue = lock;

    await previousQueue;

    try {
      this.db.exec('BEGIN TRANSACTION;');
      this.inTransaction = true;
      try {
        const result = await callback();
        this.db.exec('COMMIT;');
        this.inTransaction = false;
        this.saveToDisk();
        return result;
      } catch (err) {
        if (this.inTransaction) {
          try {
            this.db.exec('ROLLBACK;');
          } catch (_) {}
          this.inTransaction = false;
        }
        throw err;
      }
    } finally {
      resolveLock();
    }
  }
}

export const dbManager = DatabaseManager.getInstance();
