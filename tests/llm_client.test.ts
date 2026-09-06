import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateJson,
  generateText,
  LlmError,
  resolveLlmConfig,
  createLlmClient,
} from '../src/engine/llm/llmClient';

const envKeys = ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'];

describe('provider-neutral LLM client', () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses one OpenAI-compatible configuration surface', () => {
    process.env.LLM_PROVIDER = 'openai-compatible';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example/v1';
    process.env.LLM_MODEL = 'test-model';

    expect(resolveLlmConfig()).toEqual({
      provider: 'openai-compatible',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example/v1',
      model: 'test-model',
    });
  });

  it('keeps concurrent request-scoped credentials isolated', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: url.includes('upstream-a') ? 'A' : 'B' } }],
    }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const clientA = createLlmClient({ provider: 'openai-compatible', baseUrl: 'https://upstream-a.test/v1', apiKey: 'key-A', model: 'model-a' });
    const clientB = createLlmClient({ provider: 'openai-compatible', baseUrl: 'https://upstream-b.test/v1', apiKey: 'key-B', model: 'model-b' });

    await expect(Promise.all([clientA.generateText('system', 'A'), clientB.generateText('system', 'B')])).resolves.toEqual(['A', 'B']);
    expect(fetchMock).toHaveBeenCalledWith('https://upstream-a.test/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer key-A' }) }));
    expect(fetchMock).toHaveBeenCalledWith('https://upstream-b.test/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer key-B' }) }));
  });

  it('sends structured requests to an OpenAI-compatible endpoint', async () => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example/v1/';
    process.env.LLM_MODEL = 'test-model';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"answer":42}\n```' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateJson('system prompt', 'user prompt')).resolves.toEqual({ answer: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: expect.stringContaining('"response_format":{"type":"json_object"}'),
      })
    );
  });

  it('returns prose without requesting JSON mode', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Narration' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateText('system prompt', 'user prompt')).resolves.toBe('Narration');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('response_format');
  });

  it('reports missing keys and malformed JSON with stable codes', async () => {
    await expect(generateJson('system', 'user')).rejects.toMatchObject({ code: 'LLM_API_KEY_MISSING' });

    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'not json' } }],
    }), { status: 200 })));

    await expect(generateJson('system', 'user')).rejects.toMatchObject({ code: 'LLM_INVALID_JSON' });
  });

  it('normalizes upstream failures and timeouts', async () => {
    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    await expect(generateText('system', 'user')).rejects.toMatchObject({ code: 'LLM_REQUEST_FAILED' });

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await expect(generateText('system', 'user', { timeoutMs: 1 })).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
  });
});
