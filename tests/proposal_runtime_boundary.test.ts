import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const runtimeProducerFiles = [
  'src/engine/dmEngine.ts',
  'src/engine/npcCognition.ts',
  'src/engine/causality.ts',
  'src/engine/scheduler.ts',
  'src/engine/timeline/transactionService.ts',
  'src/engine/timeline/checkpointProcessor.ts',
  'src/engine/truthsEngine.ts',
  'src/engine/dependency/dependencyImpactService.ts',
  'src/engine/world/worldMutationCoordinator.ts',
];

describe('proposal runtime boundary', () => {
  it('does not allow ordinary runtime producers to commit directly to Recorder', () => {
    for (const file of runtimeProducerFiles) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/recorder\s*\.\s*commit\s*\(/);
    }
  });
});
