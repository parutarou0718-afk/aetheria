import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const allowedPathFragments = [
  'src/engine/proposal/proposalPipeline.ts',
  'src/engine/recorder/',
  'src/engine/world/worldBootstrap.ts',
  'src/engine/world/worldResetService.ts',
  'src/engine/persistence/',
  'src/engine/recovery/',
];

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

describe('proposal runtime boundary', () => {
  it('does not allow ordinary runtime producers to commit directly to Recorder', () => {
    const files = [resolve(root, 'server.ts'), ...collectTypeScriptFiles(resolve(root, 'src/engine'))];
    for (const file of files) {
      const workspacePath = relative(root, file).replace(/\\/g, '/');
      if (allowedPathFragments.some((fragment) => workspacePath === fragment || workspacePath.startsWith(fragment))) continue;
      const source = readFileSync(file, 'utf8');
      expect(source, workspacePath).not.toMatch(/recorder\s*\.\s*commit\s*\(/);
    }
  });

  it('does not allow NPC cognition to mutate nested memory or relationship state directly', () => {
    const npcSource = readFileSync(resolve(root, 'src/engine/npcCognition.ts'), 'utf8');
    expect(npcSource).not.toMatch(/\.memory\.(?:short_term|important_events)\.(?:push|unshift|splice)\s*\(/);
    expect(npcSource).not.toMatch(/\.relationships\.(?:push|unshift|splice)\s*\(/);
    expect(npcSource).not.toMatch(/setRecorderWriteContext\s*\(/);
  });
});
