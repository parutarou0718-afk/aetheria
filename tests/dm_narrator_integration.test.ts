import { beforeEach, describe, expect, it } from 'vitest';
import { DMEngine } from '../src/engine/dmEngine';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('DMEngine narrator integration', () => {
  beforeEach(async () => {
    delete process.env.GEMINI_API_KEY;
    await bootstrapWithDefaultWorld();
  });

  it('uses the default narrator role in offline fallback narration', async () => {
    const response = await DMEngine.processPlayerAction('观察天空');

    expect(response.dmNarration).toContain('世界演算者');
  });
});
