import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareDesktopEnvironment } from '../desktop/environment';

describe('desktop environment', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it('places the database below userData and loads upstream configuration privately', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheria-desktop-'));
    const config = path.join(root, '.env.demo.local');
    fs.writeFileSync(config, 'AETHERIA_UPSTREAM_1_ID=demo\nAETHERIA_UPSTREAM_1_BASE_URL=https://example.test/v1\nAETHERIA_UPSTREAM_1_API_KEY=test-secret\nAETHERIA_UPSTREAM_1_MODELS=demo-model\nAETHERIA_UPSTREAM_1_ENABLED=true\nAETHERIA_UPSTREAM_1_PRIORITY=1\n');
    const result = prepareDesktopEnvironment(path.join(root, 'user-data'), config);
    expect(result.databasePath).toBe(path.join(root, 'user-data', 'world-data', 'aetheria.db'));
    expect(fs.existsSync(path.dirname(result.databasePath))).toBe(true);
    expect(process.env.AETHERIA_UPSTREAM_1_API_KEY).toBe('test-secret');
  });

  it('fails when a required private upstream setting is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheria-desktop-'));
    const config = path.join(root, '.env.demo.local');
    fs.writeFileSync(config, 'AETHERIA_UPSTREAM_1_ID=demo\nAETHERIA_UPSTREAM_1_BASE_URL=https://example.test/v1\nAETHERIA_UPSTREAM_1_MODELS=demo-model\nAETHERIA_UPSTREAM_1_ENABLED=true\nAETHERIA_UPSTREAM_1_PRIORITY=1\n');
    expect(() => prepareDesktopEnvironment(path.join(root, 'user-data'), config)).toThrow('AETHERIA_UPSTREAM_1_API_KEY');
  });
});
