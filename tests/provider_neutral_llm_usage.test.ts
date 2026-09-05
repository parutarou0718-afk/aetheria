import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runtimeFiles = [
  'src/engine/dmEngine.ts',
  'src/engine/npcCognition.ts',
  'src/engine/causality.ts',
  'src/engine/llm/llmClient.ts',
];

describe('runtime LLM boundaries', () => {
  it('contains no Google SDK or provider-specific configuration', () => {
    const forbidden = /@google\/genai|GoogleGenAI|GEMINI_API_KEY|GEMINI_MODEL|genAIClient|getGenAI/;

    for (const file of runtimeFiles) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).not.toMatch(forbidden);
    }
  });
});
