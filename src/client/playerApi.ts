import type { PlayerBootstrapView, PlayerConversationTurn } from '../application/player/playerTypes';

export class PlayerApiError extends Error { public constructor(public readonly code: string, message: string) { super(message); } }
function getSessionId(): string { const key = 'aetheria-player-session'; const existing = sessionStorage.getItem(key); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem(key, created); return created; }
const pendingMutationIds = new Map<string, string>();
const pendingMutationStoragePrefix = 'aetheria-pending-mutation:';
const unresolvedReceiptCodes = new Set(['REQUEST_IN_PROGRESS', 'REQUEST_OUTCOME_UNKNOWN', 'REQUEST_OUTCOME_UNCONFIRMED', 'REQUEST_RECEIPT_PERSISTENCE_FAILED', 'RUNTIME_NOT_READY']);
function pendingStorageKey(key: string): string { return `${pendingMutationStoragePrefix}${encodeURIComponent(key)}`; }
function retainPendingMutation(key: string, id: string): void { pendingMutationIds.set(key, id); sessionStorage.setItem(pendingStorageKey(key), id); }
function pendingMutationId(key: string): string | undefined { return pendingMutationIds.get(key) ?? sessionStorage.getItem(pendingStorageKey(key)) ?? undefined; }
function clearPendingMutation(key: string): void { pendingMutationIds.delete(key); sessionStorage.removeItem(pendingStorageKey(key)); }

/** A logical mutation retains its id across transport failures.  The server owns
 * deduplication; this client helper merely prevents an accidental new id on retry. */
export async function requestMutation<T>(path: string, init: RequestInit, requestId?: string): Promise<T> {
  const key = `${init.method ?? 'POST'}:${path}:${typeof init.body === 'string' ? init.body : ''}`;
  const id = requestId ?? pendingMutationId(key) ?? crypto.randomUUID();
  retainPendingMutation(key, id);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Aetheria-Session-Id': getSessionId(), 'X-Aetheria-Request-Id': id, ...(init.headers ?? {}) } });
  } catch (error) {
    // No trustworthy terminal response: retain this id for an explicit retry.
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  // These responses mean the server cannot confirm a receipt. Keep the exact
  // id across retry and reload rather than permitting an accidental new action.
  if (typeof body.code === 'string' && unresolvedReceiptCodes.has(body.code)) {
    throw new PlayerApiError(body.code, typeof body.error === 'string' ? body.error : 'The request outcome needs reconciliation.');
  }
  // Any other HTTP response is a trustworthy terminal result, including an
  // application rejection. A later player action deliberately gets a new id.
  clearPendingMutation(key);
  if (!response.ok) throw new PlayerApiError(typeof body.code === 'string' ? body.code : 'NETWORK_ERROR', typeof body.error === 'string' ? body.error : 'The request could not be completed.');
  return body as T;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!init?.method || init.method === 'GET') {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Aetheria-Session-Id': getSessionId(), ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new PlayerApiError(typeof body.code === 'string' ? body.code : 'NETWORK_ERROR', typeof body.error === 'string' ? body.error : 'The request could not be completed.');
    return body as T;
  }
  return requestMutation<T>(path, init);
}
export const playerApi = {
  getBootstrap: () => request<PlayerBootstrapView>('/api/v1/player/bootstrap'),
  createWorld: (body: { userVision: string; constraints?: unknown }) => request<{ status: string }>('/api/v1/player/world/genesis', { method: 'POST', body: JSON.stringify(body) }),
  resetWorld: () => request<{ status: string }>('/api/v1/player/world/reset', { method: 'POST', body: '{}' }),
  sendDmAction: (text: string) => request<{ narration: string; stateUpdates: string[]; epoch: number }>('/api/v1/player/dm/action', { method: 'POST', body: JSON.stringify({ text }) }),
  getNpcDialogueHistory: (npcId: string) => request<{ turns: PlayerConversationTurn[] }>(`/api/v1/player/npcs/${encodeURIComponent(npcId)}/dialogue-history`),
  sendNpcDialogue: (npcId: string, message: string) => request<{ reply: string; epoch: number; stateUpdates: string[] }>(`/api/v1/player/npcs/${encodeURIComponent(npcId)}/dialogue`, { method: 'POST', body: JSON.stringify({ message }) }),
  travel: (destinationLocationId: string) => request<{ status: string; expectedEndEpoch: number }>('/api/v1/player/travel', { method: 'POST', body: JSON.stringify({ destinationLocationId }) }),
  advanceTime: () => request<{ newEpoch: number; visibleSummary?: string }>('/api/v1/player/time/advance', { method: 'POST', body: '{}' }),
  updateProfile: (body: { name?: string; title?: string }) => request<{ status: string }>('/api/v1/player/profile', { method: 'POST', body: JSON.stringify(body) }),
};
