import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('runtime LLM boundaries', () => {
  it('contains no Google SDK, legacy configuration, or provider-branded runtime copy', () => {
    const forbidden = /@google\/genai|GoogleGenAI|GEMINI_API_KEY|GEMINI_MODEL|generativelanguage\.googleapis\.com|Gemini/;
    const root = process.cwd();
    const files = [
      resolve(root, 'server.ts'),
      ...productionFiles(resolve(root, 'src')),
      resolve(root, 'package.json'),
      resolve(root, '.env.example'),
      resolve(root, 'README.md'),
    ];

    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(forbidden);
    }
  });
});
