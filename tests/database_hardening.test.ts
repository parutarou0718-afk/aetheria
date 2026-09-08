import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseManager, DatabaseDurabilityError } from '../src/engine/persistence/database';

const temporaryDirectories: string[] = [];

function createTemporaryDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheria-db-hardening-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'aetheria.db');
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('DatabaseManager durability and operation isolation', () => {
  it('shares one initialization and serializes an outside write behind an active transaction', async () => {
    const manager = createDatabaseManager({ databasePath: createTemporaryDatabasePath() });
    await Promise.all([manager.initialize(), manager.initialize(), manager.initialize()]);
    await manager.run('CREATE TABLE operation_test (id TEXT PRIMARY KEY, value TEXT NOT NULL)');

    let releaseTransaction!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseTransaction = resolve; });
    const transaction = manager.transaction(async () => {
      await manager.run("INSERT INTO operation_test VALUES ('A1', 'inside')");
      await barrier;
      await manager.run("INSERT INTO operation_test VALUES ('A2', 'inside')");
    });

    await new Promise((resolve) => setImmediate(resolve));
    let externalWriteFinished = false;
    const externalWrite = manager.run("INSERT INTO operation_test VALUES ('B', 'outside')").then(() => {
      externalWriteFinished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(externalWriteFinished).toBe(false);

    releaseTransaction();
    await Promise.all([transaction, externalWrite]);
    expect((await manager.all<{ id: string }>('SELECT id FROM operation_test ORDER BY id')).map((row) => row.id))
      .toEqual(['A1', 'A2', 'B']);
    await manager.close();
  });

  it('restores the last durable database and throws when atomic persistence fails', async () => {
    const databasePath = createTemporaryDatabasePath();
    const manager = createDatabaseManager({ databasePath });
    await manager.initialize();
    await manager.run('CREATE TABLE durable_test (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await manager.run("INSERT INTO durable_test VALUES ('old', 'durable')");

    manager.setPersistenceFaultForTest(new Error('simulated temp-file failure'));
    await expect(manager.run("INSERT INTO durable_test VALUES ('new', 'not-durable')"))
      .rejects.toBeInstanceOf(DatabaseDurabilityError);
    expect(await manager.get<{ value: string }>("SELECT value FROM durable_test WHERE id = 'old'"))
      .toEqual({ value: 'durable' });
    expect(await manager.get("SELECT value FROM durable_test WHERE id = 'new'"))
      .toBeUndefined();

    await manager.close();
    const reopened = createDatabaseManager({ databasePath });
    await reopened.initialize();
    expect(await reopened.get<{ value: string }>("SELECT value FROM durable_test WHERE id = 'old'"))
      .toEqual({ value: 'durable' });
    expect(await reopened.get("SELECT value FROM durable_test WHERE id = 'new'"))
      .toBeUndefined();
    await reopened.close();
  });

  it('recovers a corrupt primary from a valid retained backup and fails closed without one', async () => {
    const databasePath = createTemporaryDatabasePath();
    const manager = createDatabaseManager({ databasePath });
    await manager.initialize();
    await manager.run('CREATE TABLE recovery_test (value TEXT NOT NULL)');
    await manager.run("INSERT INTO recovery_test VALUES ('recoverable')");
    await manager.flush();
    await manager.close();

    fs.copyFileSync(databasePath, `${databasePath}.bak`);
    fs.writeFileSync(databasePath, Buffer.from('not-a-sqlite-database'));
    const recovered = createDatabaseManager({ databasePath });
    await recovered.initialize();
    expect(await recovered.get<{ value: string }>('SELECT value FROM recovery_test')).toEqual({ value: 'recoverable' });
    await recovered.close();

    fs.writeFileSync(databasePath, Buffer.from('still-corrupt'));
    fs.writeFileSync(`${databasePath}.bak`, Buffer.from('also-corrupt'));
    const failed = createDatabaseManager({ databasePath });
    await expect(failed.initialize()).rejects.toMatchObject({ code: 'DATABASE_CORRUPTION' });
  });
});
