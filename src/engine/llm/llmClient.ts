/**
 * Provider-neutral LLM boundary for every runtime caller.
 *
 * The configured endpoint must implement the OpenAI Chat Completions API.
 * Provider-specific SDKs and provider-specific environment variables are
 * deliberately not supported here.
 */

export interface LlmConfig {
  provider: 'openai-compatible';
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface PublicLlmConfig {
  provider: 'openai-compatible';
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

export interface LlmRequestOptions {
  /** Maximum wait in ms for one completion. Defaults to 60000. */
  timeoutMs?: number;
  /** Additional schema guidance included in the user message for JSON requests. */
  jsonSchemaHint?: string;
}

export interface LlmClient {
  generateJson(system: string, user: string, options?: LlmRequestOptions): Promise<unknown>;
  generateText(system: string, user: string, options?: LlmRequestOptions): Promise<string>;
  generateTextWithUsage(system: string, user: string, options?: LlmRequestOptions): Promise<LlmCompletion>;
  generateJsonWithUsage(system: string, user: string, options?: LlmRequestOptions): Promise<LlmCompletion>;
}

export interface LlmCompletion { content: string; inputTokens?: number; outputTokens?: number; }

export class LlmError extends Error {
  constructor(
    message: string,
    public code: 'LLM_API_KEY_MISSING' | 'LLM_REQUEST_FAILED' | 'LLM_TIMEOUT' | 'LLM_INVALID_JSON',
    public provider: 'openai-compatible' = 'openai-compatible',
    public cause?: unknown
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export function resolveLlmConfig(): LlmConfig {
  return {
    provider: 'openai-compatible',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
  };
}

function isNonEmptyKey(key: string | undefined): boolean {
  return Boolean(key && key.trim() && key !== 'MY_LLM_API_KEY');
}

export function hasLlmApiKey(): boolean {
  return isNonEmptyKey(resolveLlmConfig().apiKey);
}

export function getPublicLlmConfig(): PublicLlmConfig {
  const config = resolveLlmConfig();
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: hasLlmApiKey(),
  };
}

export function activeKeyEnvName(): string {
  return 'LLM_API_KEY';
}

export function activeProviderLabel(): string {
  return resolveLlmConfig().provider;
}

export function createLlmClient(config: LlmConfig): LlmClient {
  return {
    generateJson: (system, user, options = {}) => generateJsonWithConfig(config, system, user, options),
    generateText: (system, user, options = {}) => generateTextWithConfig(config, system, user, options),
    generateTextWithUsage: (system, user, options = {}) => requestCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], false, config, options.timeoutMs),
    generateJsonWithUsage: (system, user, options = {}) => requestCompletion(
      [{ role: 'system', content: system }, { role: 'user', content: options.jsonSchemaHint ? `${user}\n\nJSON SCHEMA:\n${options.jsonSchemaHint}` : user }],
      true,
      config,
      options.timeoutMs
    ),
  };
}

export async function generateJson(
  system: string,
  user: string,
  options: LlmRequestOptions = {}
): Promise<unknown> {
  return generateJsonWithConfig(resolveLlmConfig(), system, user, options);
}

async function generateJsonWithConfig(config: LlmConfig, system: string, user: string, options: LlmRequestOptions): Promise<unknown> {
  const content = options.jsonSchemaHint ? `${user}\n\nJSON SCHEMA:\n${options.jsonSchemaHint}` : user;
  const raw = await requestCompletion(
    [{ role: 'system', content: system }, { role: 'user', content }],
    true,
    config,
    options.timeoutMs
  );

  try {
    return JSON.parse(stripCodeFences(raw.content));
  } catch (cause) {
    throw new LlmError('LLM returned invalid JSON.', 'LLM_INVALID_JSON', 'openai-compatible', cause);
  }
}

export async function generateText(
  system: string,
  user: string,
  options: LlmRequestOptions = {}
): Promise<string> {
  return generateTextWithConfig(resolveLlmConfig(), system, user, options);
}

async function generateTextWithConfig(config: LlmConfig, system: string, user: string, options: LlmRequestOptions): Promise<string> {
  return (await requestCompletion(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    false,
    config,
    options.timeoutMs
  )).content;
}

async function requestCompletion(messages: ChatMessage[], jsonMode: boolean, config: LlmConfig, timeoutMs = 60000): Promise<LlmCompletion> {
  if (!isNonEmptyKey(config.apiKey)) {
    throw new LlmError(`No API key configured. Set ${activeKeyEnvName()}.`, 'LLM_API_KEY_MISSING');
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.8,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  try {
    return await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      }).then(async (response) => {
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${detail.slice(0, 500)}`);
        }
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          throw new Error('OpenAI-compatible endpoint returned an empty completion.');
        }
        const usage = payload?.usage;
        return {
          content: content.trim(),
          inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
          outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
        };
      }),
      timeoutMs
    );
  } catch (cause) {
    if (cause instanceof LlmError) throw cause;
    throw new LlmError(
      `LLM request failed (${config.model}): ${(cause as Error).message}`,
      'LLM_REQUEST_FAILED',
      'openai-compatible',
      cause
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmError(`LLM request timed out after ${timeoutMs}ms.`, 'LLM_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripCodeFences(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : text.trim();
}
