import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toDesktopModuleUrl } from '../desktop/runtimePath';

describe('desktop module URL', () => {
  it('converts a Windows server path to an ESM file URL', () => {
    const moduleUrl = toDesktopModuleUrl(path.win32.join('E:', 'Aetheria', 'resources', 'app.asar', 'dist', 'server.cjs'));
    expect(moduleUrl).toBe('file:///E:/Aetheria/resources/app.asar/dist/server.cjs');
  });
});
