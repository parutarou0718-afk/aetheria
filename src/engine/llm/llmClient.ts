/**
 * Unified LLM client abstraction (OpenAI-compatible first).
 *
 * Providers:
 *  - openai / deepseek : generic OpenAI-compatible Chat Completions API
 *      (DeepSeek, OpenAI, and any OpenAI-compatible gateway).
 *      DeepSeek itself is reachable via `https://api.deepseek.com/v1`.
 *  - gemini            : Google native SDK (@google/genai).
 *
 * Selection is driven by `LLM_PROVIDER` env var:
 *   - 'gemini'             -> Google native SDK     (uses GEMINI_API_KEY)
 *   - 'deepseek'           -> OpenAI-compatible     (uses DEEPSEEK_API_KEY,
 *                                                     default base https://api.deepseek.com/v1,
 *                                                     default model deepseek-v4-flash)
 *   - 'openai' / anything  -> generic OpenAI-compatible gateway
 *                                                     (uses OPENAI_API_KEY,
 *                                                     default base https://api.openai.com/v1,
 *                                                     default model from OPENAI_API_MODEL)
 *
 * All key values are read from process.env at request time, never hard-coded,
 * so you can configure them yourself via env / .env / your secret store.
 *
 * All util methods are designed to output strict JSON and to bubble up errors —
 * they never fabricate "successful" content.
 */

import { GoogleGenAI } from '@google/genai';

export type LlmProvider = 'gemini' | 'openai';
export type LlmProviderAlias = 'gemini' | 'openai' | 'deepseek';

export interface LlmConfig {
  provider: LlmProvider;
  /** Effective name passed to the upstream API. */
  model: string;
  apiKey: string;
  baseUrl: string;
  /** Original alias requested ('deepseek', 'openai', 'gemini'). */
  alias: string;
}

export interface LlmJsonOptions {
  /** Maximum wait in ms for a single completion. Defaults to 60000. */
  timeoutMs?: number;
  /** Exact JSON shape to instruct the model with (schema description, not enforced). */
  jsonSchemaHint?: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: LlmProvider,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

function normalizeProvider(raw: string | undefined): LlmProviderAlias {
  const v = (raw || 'openai').toLowerCase().trim();
  if (v === 'gemini') return 'gemini';
  if (v === 'deepseek') return 'deepseek';
  return 'openai';
}

/**
 * Resolve effective configuration for the requested/active provider.
 * Reads all inputs from process.env so you control the keys.
 */
export function resolveLlmConfig(): LlmConfig {
  const alias = normalizeProvider(process.env.LLM_PROVIDER || 'openai');

  if (alias === 'gemini') {
    return {
      provider: 'gemini',
      alias,
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.LLM_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      baseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com',
    };
  }

  if (alias === 'deepseek') {
    return {
      provider: 'openai',
      alias,
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
      model: process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      baseUrl: process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    };
  }

  // generic openai-compatible gateway
  return {
    provider: 'openai',
    alias: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || process.env.OPENAI_API_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
  };
}

function isNonEmptyKey(key: string | undefined): boolean {
  return Boolean(
    key &&
      key !== 'MY_GEMINI_API_KEY' &&
      key !== 'MY_DEEPSEEK_API_KEY' &&
      key !== 'MY_OPENAI_API_KEY'
  );
}

/** Whether the active provider has a usable API key configured. */
export function hasLlmApiKey(): boolean {
  return isNonEmptyKey(resolveLlmConfig().apiKey);
}

/** Env var name that should hold the key for the active provider (for error hints). */
export function activeKeyEnvName(): string {
  const cfg = resolveLlmConfig();
  if (cfg.alias === 'deepseek') return 'DEEPSEEK_API_KEY';
  if (cfg.alias === 'gemini') return 'GEMINI_API_KEY';
  return 'OPENAI_API_KEY';
}

/** Provider label for human-facing logging / overrides. */
export function activeProviderLabel(): string {
  return resolveLlmConfig().alias;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LLM request timed out after ${ms}ms (${label})`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Request a single structured (JSON object) completion.
 * Returns the parsed JSON value, or throws LlmError on failure.
 */
export async function generateJson(
  system: string,
  user: string,
  options: LlmJsonOptions = {}
): Promise<any> {
  const cfg = resolveLlmConfig();
  const timeoutMs = options.timeoutMs ?? 60000;
  const userPayload = options.jsonSchemaHint
    ? `${user}\n\nJSON SCHEMA:\n${options.jsonSchemaHint}`
    : user;

  try {
    if (!isNonEmptyKey(cfg.apiKey)) {
      throw new LlmError(
        `No API key configured for provider "${cfg.alias}". Set ${activeKeyEnvName()}.`,
        'LLM_API_KEY_MISSING',
        cfg.provider
      );
    }

    if (cfg.provider === 'gemini') {
      return await withTimeout(requestGemini(cfg, system, userPayload), timeoutMs, 'gemini-json');
    }

    return await withTimeout(
      requestOpenAiCompatible(cfg, [
        { role: 'system', content: system },
        { role: 'user', content: userPayload },
      ]),
      timeoutMs,
      `${cfg.alias}-json`
    );
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw new LlmError(
      `LLM request failed (${cfg.alias}/${cfg.model}): ${(err as Error).message}`,
      'LLM_REQUEST_FAILED',
      cfg.provider,
      err
    );
  }
}

// --- OpenAI-compatible Chat Completions (covers OpenAI, DeepSeek, compatible gateways) ---

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function requestOpenAiCompatible(cfg: LlmConfig, messages: ChatMessage[]): Promise<any> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.8,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenAI-compatible HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI-compatible endpoint returned empty completion.');
  }

  // Some responses include markdown code fences — strip them defensively.
  const cleaned = stripCodeFences(content.trim());
  return JSON.parse(cleaned);
}

// --- Gemini (native SDK) ---

async function requestGemini(cfg: LlmConfig, _system: string, userContent: string): Promise<any> {
  const ai = new GoogleGenAI({
    apiKey: cfg.apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await ai.models.generateContent({
    model: cfg.model,
    contents: userContent,
    config: {
      systemInstruction: _system,
      responseMimeType: 'application/json',
    },
  });

  const rawText = response.text || '';
  if (!rawText.trim()) {
    throw new Error('Gemini returned empty completion.');
  }
  return JSON.parse(stripCodeFences(rawText.trim()));
}

function stripCodeFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  return t;
}
