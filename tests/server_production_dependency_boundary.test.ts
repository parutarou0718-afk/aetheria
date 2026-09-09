import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production server dependency boundary', () => {
  it('loads Vite only for development middleware', () => {
    const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    expect(serverSource).not.toMatch(/from 'vite'/);
    expect(serverSource).toContain("await import('vite')");
  });
});
