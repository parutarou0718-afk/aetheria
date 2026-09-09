import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toDesktopModuleUrl } from '../desktop/runtimePath';

describe('desktop module URL', () => {
  it('converts a Windows server path to an ESM file URL', () => {
    const moduleUrl = toDesktopModuleUrl(path.win32.join('E:', 'Aetheria', 'resources', 'app.asar', 'dist', 'server.cjs'));
    expect(moduleUrl).toBe('file:///E:/Aetheria/resources/app.asar/dist/server.cjs');
  });

  it('sets production mode before loading the embedded server', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'main.ts'), 'utf8');
    const productionMode = source.indexOf("process.env.NODE_ENV = 'production'");
    const serverImport = source.indexOf('await import(toDesktopModuleUrl(serverPath))');
    expect(productionMode).toBeGreaterThanOrEqual(0);
    expect(productionMode).toBeLessThan(serverImport);
  });
});
