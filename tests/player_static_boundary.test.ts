import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('player presentation static boundary', () => {
  it('keeps raw domain types out of player components', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/player/PlayerGameShell.tsx'), 'utf8');
    expect(shell).not.toMatch(/from ['"].*\/types['"]/);
    expect(shell).not.toContain('HiddenTruth');
    expect(shell).not.toContain('Character,');
    expect(shell).toContain('PlayerBootstrapView');
  });

  it('keeps the player shell safe across refresh, reset, and developer mode', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/player/PlayerGameShell.tsx'), 'utf8');
    expect(shell).toContain('selectedNpcId');
    expect(shell).toContain('visibleNpcs.some');
    expect(shell).toContain('confirmReset');
    expect(shell).toContain('Developer Inspector');
    expect(shell).not.toContain('/api/v1/truths');
    expect(shell).not.toContain('/api/v1/admin');
  });

  it('keeps privileged raw paths out of all normal player client code', () => {
    const playerDirectory = join(process.cwd(), 'src/components/player');
    const sources = [
      readFileSync(join(process.cwd(), 'src/client/playerApi.ts'), 'utf8'),
      ...readdirSync(playerDirectory).filter((name) => name.endsWith('.ts') || name.endsWith('.tsx')).map((name) => readFileSync(join(playerDirectory, name), 'utf8')),
    ];
    for (const forbidden of ['/api/v1/truths', '/api/v1/seeds', '/api/v1/admin', '/api/v1/characters', '/api/v1/timeline', 'HiddenTruth', 'NpcAutonomyRun']) {
      for (const source of sources) expect(source).not.toContain(forbidden);
    }
  });
});
