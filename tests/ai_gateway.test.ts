import { describe, expect, it, vi } from 'vitest';
import { createAiService, AiServiceError } from '../src/engine/ai/aiService';
import { InMemoryCreditService } from '../src/engine/ai/billing/creditService';
import { InMemoryUsageLedger } from '../src/engine/ai/usage/usageLedger';
import type { UpstreamConfig } from '../src/engine/ai/upstream/upstreamTypes';

const upstreamA: UpstreamConfig = { id: 'a', type: 'openai-compatible', baseUrl: 'https://a.test/v1', apiKey: 'key-A', enabled: true, priority: 1, models: ['standard-model'] };
const upstreamB: UpstreamConfig = { id: 'b', type: 'openai-compatible', baseUrl: 'https://b.test/v1', apiKey: 'key-B', enabled: true, priority: 2, models: ['advanced-model'] };

describe('AI Gateway', () => {
  it('routes to a compatible priority upstream and records usage without credentials', async () => {
    const ledger = new InMemoryUsageLedger();
    const service = createAiService({ upstreams: [upstreamA, upstreamB], ledger, credits: new InMemoryCreditService({ user: 10 }) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 3, completion_tokens: 5 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.generateText({ userId: 'user', worldId: 'world', purpose: 'DM_ACTION' }, 's', 'u')).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith('https://a.test/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer key-A' }) }));
    const [record] = await ledger.getByUser('user');
    expect(record).toMatchObject({ userId: 'user', worldId: 'world', purpose: 'DM_ACTION', tier: 'STANDARD', upstreamId: 'a', model: 'standard-model', inputTokens: 3, outputTokens: 5, status: 'SUCCESS' });
    expect(JSON.stringify(record)).not.toContain('key-A');
  });

  it('rejects insufficient credit before calling an upstream', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const service = createAiService({ upstreams: [upstreamA], credits: new InMemoryCreditService({ user: 0 }) });
    await expect(service.generateText({ userId: 'user', worldId: 'world', purpose: 'NPC_DIALOGUE' }, 's', 'u')).rejects.toMatchObject({ code: 'AI_CREDIT_INSUFFICIENT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a failed upstream request and never charges credit', async () => {
    const credits = new InMemoryCreditService({ user: 10 }); const ledger = new InMemoryUsageLedger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    const service = createAiService({ upstreams: [upstreamA], credits, ledger });
    await expect(service.generateText({ userId: 'user', worldId: 'world', purpose: 'NPC_DIALOGUE' }, 's', 'u')).rejects.toBeInstanceOf(AiServiceError);
    expect(await credits.getBalance('user')).toBe(10);
    expect((await ledger.getByUser('user'))[0]).toMatchObject({ status: 'FAILED', chargedCredits: 0 });
  });

  it('requests JSON mode for structured generation through the gateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"world":"ready"}' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService({ upstreams: [upstreamA], credits: new InMemoryCreditService({ user: 10 }) });

    await expect(service.generateJson({ userId: 'user', worldId: 'world', purpose: 'DM_ACTION' }, 's', 'u')).resolves.toEqual({ world: 'ready' });
    expect(fetchMock.mock.calls[0][1].body).toContain('"response_format":{"type":"json_object"}');
  });
});
