import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('MVP commercial boundary', () => {
  it('does not ship VIP, advertising, recharge, or art-quota mock flows', () => {
    const files = [
      'src/App.tsx',
      'src/components/Navbar.tsx',
      'src/components/DMConsole.tsx',
      'src/types.ts',
      'server.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source, file).not.toMatch(/VIPModal|AdModal|AdventureGalleryModal|commercialState|artQuotas|art\/generate|充值|广告/);
    }
    expect(existsSync(resolve(root, 'src/components/AdModal.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'src/components/VIPModal.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'src/components/AdventureGalleryModal.tsx'))).toBe(false);
  });
});
