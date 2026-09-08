import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('player presentation static boundary', () => {
  it('keeps raw domain types out of player components', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/player/PlayerGameShell.tsx'), 'utf8');
    expect(shell).not.toMatch(/from ['"].*\/types['"]/);
    expect(shell).not.toContain('HiddenTruth');
    expect(shell).not.toContain('Character,');
    expect(shell).toContain('PlayerBootstrapView');
  });
});
