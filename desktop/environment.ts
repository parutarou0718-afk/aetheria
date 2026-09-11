import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const requiredKeys = [
  'AETHERIA_UPSTREAM_1_ID',
  'AETHERIA_UPSTREAM_1_BASE_URL',
  'AETHERIA_UPSTREAM_1_API_KEY',
  'AETHERIA_UPSTREAM_1_MODELS',
  'AETHERIA_UPSTREAM_1_ENABLED',
  'AETHERIA_UPSTREAM_1_PRIORITY',
] as const;

export interface DesktopEnvironment {
  databasePath: string;
  logDirectory: string;
}

/** Must run before dynamically importing the Aetheria server/runtime bundle. */
export function prepareDesktopEnvironment(userDataPath: string, demoConfigPath: string): DesktopEnvironment {
  const loaded = dotenv.config({ path: demoConfigPath, override: true, quiet: true });
  if (loaded.error) throw new Error('Demo AI configuration could not be read.');
  for (const key of requiredKeys) {
    if (!process.env[key]?.trim()) throw new Error(`Demo AI configuration requires ${key}.`);
  }
  const worldDataDirectory = path.join(userDataPath, 'world-data');
  const logDirectory = path.join(userDataPath, 'logs');
  fs.mkdirSync(worldDataDirectory, { recursive: true });
  fs.mkdirSync(logDirectory, { recursive: true });
  const databasePath = path.join(worldDataDirectory, 'aetheria.db');
  process.env.DATABASE_PATH = databasePath;
  process.env.AETHERIA_DEV_INSPECTOR = 'false';
  return { databasePath, logDirectory };
}
