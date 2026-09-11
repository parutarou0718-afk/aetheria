import { createLlmClient, LlmError, type LlmClient, type LlmConfig, type LlmRequestOptions } from '../llm/llmClient';
import type { AiRequestContext, AiServiceErrorCode } from './aiTypes';
import { ModelRouter, createModelRouterFromEnvironment } from './routing/modelRouter';
import { UpstreamPool } from './upstream/upstreamPool';
import type { UpstreamConfig } from './upstream/upstreamTypes';
import { InMemoryCreditService, type CreditService } from './billing/creditService';
import { estimateProviderCost } from './billing/costModel';
import { InMemoryUsageLedger, type UsageLedger } from './usage/usageLedger';
import type { AiUsageRecord } from './usage/usageTypes';

export class AiServiceError extends Error { constructor(message: string, public readonly code: AiServiceErrorCode) { super(message); this.name = 'AiServiceError'; } }
export interface AiService { generateText(context: AiRequestContext, system: string, user: string, options?: LlmRequestOptions): Promise<string>; generateJson(context: AiRequestContext, system: string, user: string, options?: LlmRequestOptions): Promise<unknown>; isAvailable(context: AiRequestContext): boolean; }
export interface AiServiceDependencies { upstreams?: UpstreamConfig[]; pool?: UpstreamPool; router?: ModelRouter; ledger?: UsageLedger; credits?: CreditService; clientFactory?: (config: LlmConfig) => LlmClient; }
class DefaultAiService implements AiService {
  private readonly pool: UpstreamPool; private readonly router: ModelRouter; private readonly ledger: UsageLedger; private readonly credits: CreditService;
  private readonly clientFactory: (config: LlmConfig) => LlmClient;
  constructor(deps: AiServiceDependencies = {}) { this.pool = deps.pool ?? new UpstreamPool(deps.upstreams ?? []); this.router = deps.router ?? createModelRouterFromEnvironment(); this.ledger = deps.ledger ?? new InMemoryUsageLedger(); this.credits = deps.credits ?? new InMemoryCreditService(); this.clientFactory = deps.clientFactory ?? createLlmClient; }
  isAvailable(context: AiRequestContext): boolean { try { return Boolean(this.pool.select(this.router.route(context.purpose, context.tier).model)); } catch { return false; } }
  async generateText(context: AiRequestContext, system: string, user: string, options: LlmRequestOptions = {}): Promise<string> { const completion = await this.request(context, system, user, options, false); return completion.content; }
  async generateJson(context: AiRequestContext, system: string, user: string, options: LlmRequestOptions = {}): Promise<unknown> { const completion = await this.request(context, system, user, options, true); try { return JSON.parse(completion.content.replace(/^```json\s*|\s*```$/g, '').trim()); } catch { throw new AiServiceError('AI returned invalid JSON.', 'AI_INVALID_RESPONSE'); } }
  private async request(context: AiRequestContext, system: string, user: string, options: LlmRequestOptions, json: boolean) {
    const route = this.router.route(context.purpose, context.tier); const upstream = this.pool.select(route.model); if (!upstream) throw new AiServiceError('No compatible AI route is available.', 'AI_NO_ROUTE');
    if (!(await this.credits.canAfford(context.userId, 1))) throw new AiServiceError('AI credit is insufficient.', 'AI_CREDIT_INSUFFICIENT');
    const base: Omit<AiUsageRecord, 'id' | 'status' | 'createdAt'> = { userId: context.userId, worldId: context.worldId, purpose: context.purpose, tier: route.tier, upstreamId: upstream.id, model: route.model };
    try { const client = this.clientFactory({ provider: 'openai-compatible', baseUrl: upstream.baseUrl, apiKey: upstream.apiKey, model: route.model }); const completion = json ? await client.generateJsonWithUsage(system, user, options) : await client.generateTextWithUsage(system, user, options); const id = crypto.randomUUID(); const record: AiUsageRecord = { ...base, id, inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, estimatedCostUsd: estimateProviderCost({ model: route.model, inputTokens: completion.inputTokens, outputTokens: completion.outputTokens }), chargedCredits: 1, status: 'SUCCESS', createdAt: Date.now() }; await this.credits.charge(context.userId, 1, id); await this.ledger.record(record); return completion; } catch (cause) { const record: AiUsageRecord = { ...base, id: crypto.randomUUID(), chargedCredits: 0, status: 'FAILED', createdAt: Date.now() }; try { await this.ledger.record(record); } catch { throw new AiServiceError('AI usage recording failed.', 'AI_USAGE_RECORD_FAILED'); } if (cause instanceof AiServiceError) throw cause; if (cause instanceof LlmError) throw new AiServiceError('AI upstream request failed.', 'AI_UPSTREAM_FAILED'); throw new AiServiceError('AI upstream request failed.', 'AI_UPSTREAM_FAILED'); }
  }
}
export function createAiService(deps: AiServiceDependencies = {}): AiService { return new DefaultAiService(deps); }
export const aiService = createAiService({ pool: UpstreamPool.fromEnvironment() });
