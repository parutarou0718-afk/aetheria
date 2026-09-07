import { beforeEach, describe, expect, it } from 'vitest';
import { DMEngine } from '../src/engine/dmEngine';
import { globalWorld } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('DMEngine narrator integration', () => {
  beforeEach(async () => {
    delete process.env.LLM_API_KEY;
    await bootstrapWithDefaultWorld();
  });

  it('uses the default narrator role in offline fallback narration', async () => {
    const response = await DMEngine.processPlayerAction({
      userId: 'SYSTEM_USER', sessionId: 'test-session', worldId: globalWorld.snapshot.id,
      actorId: 'pc-player', channel: 'WEB', mode: 'IN_WORLD_ACTION',
    }, '观察天空');

    expect(response.dmNarration).toContain('世界演算者');
  });
});
