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

  it('keeps WorldRuleValidator deterministic and read-only', () => {
    const validatorSource = readFileSync(resolve(root, 'src/engine/constraints/rules/worldRuleValidator.ts'), 'utf8');
    expect(validatorSource).not.toMatch(/globalWorld|aiService|llmClient|generateJson|generateText/);
    expect(validatorSource).not.toMatch(/recorder\s*\.\s*commit\s*\(/);
    expect(validatorSource).not.toMatch(/setRecorderWriteContext\s*\(/);
  });

  it('keeps parameter and causal validators deterministic and read-only', () => {
    for (const path of [
      'src/engine/constraints/parameters/parameterResolver.ts',
      'src/engine/constraints/causality/causalBasisValidator.ts',
    ]) {
      const source = readFileSync(resolve(root, path), 'utf8');
      expect(source, path).not.toMatch(/globalWorld|aiService|llmClient|generateJson|generateText|DMEngine/);
      expect(source, path).not.toMatch(/recorder\s*\.\s*commit\s*\(|setRecorderWriteContext\s*\(/);
    }
  });

  it('keeps history validation and observer knowledge deterministic and read-only', () => {
    for (const path of [
      'src/engine/history/observedHistoryValidator.ts',
      'src/engine/history/historyConflictDetector.ts',
      'src/engine/history/stateFieldDiffProjector.ts',
      'src/engine/history/observerKnowledgeService.ts',
    ]) {
      const source = readFileSync(resolve(root, path), 'utf8');
      expect(source, path).not.toMatch(/aiService|llmClient|generateJson|generateText|recorder\s*\.\s*commit\s*\(|setRecorderWriteContext\s*\(/);
    }
  });

  it('keeps NPC prompts away from canonical hidden truth fields', () => {
    const npcSource = readFileSync(resolve(root, 'src/engine/npcCognition.ts'), 'utf8');
    expect(npcSource).not.toMatch(/globalWorld\.hiddenTruths|\.true_nature|\.true_goal/);
    expect(npcSource).toMatch(/ObserverKnowledgeService/);
  });

  it('does not allow DM to read LLM-authored numeric gameplay deltas', () => {
    const dmSource = readFileSync(resolve(root, 'src/engine/dmEngine.ts'), 'utf8');
    expect(dmSource).not.toMatch(/parsed\.(?:hpDelta|mpDelta|goldDelta)/);
    expect(dmSource).toMatch(/APPLY_SEMANTIC_EFFECT/);
  });

  it('keeps semantic actor identity runtime-owned rather than trusting an LLM effect object', () => {
    const dmSource = readFileSync(resolve(root, 'src/engine/dmEngine.ts'), 'utf8');
    expect(dmSource).toMatch(/actorId:\s*context\.actorId/);
    expect(dmSource).not.toMatch(/semanticEffect:\s*effect/);
  });
});
