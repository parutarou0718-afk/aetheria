import type { PlayerBootstrapView, PlayerConversationTurn } from '../application/player/playerTypes';

export class PlayerApiError extends Error { public constructor(public readonly code: string, message: string) { super(message); } }
function getSessionId(): string { const key = 'aetheria-player-session'; const existing = sessionStorage.getItem(key); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem(key, created); return created; }
const pendingMutationIds = new Map<string, string>();

/** A logical mutation retains its id across transport failures.  The server owns
 * deduplication; this client helper merely prevents an accidental new id on retry. */
export async function requestMutation<T>(path: string, init: RequestInit, requestId?: string): Promise<T> {
  const key = `${init.method ?? 'POST'}:${path}:${typeof init.body === 'string' ? init.body : ''}`;
  const id = requestId ?? pendingMutationIds.get(key) ?? crypto.randomUUID();
  pendingMutationIds.set(key, id);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Aetheria-Session-Id': getSessionId(), 'X-Aetheria-Request-Id': id, ...(init.headers ?? {}) } });
  } catch (error) {
    // No trustworthy terminal response: retain this id for an explicit retry.
    throw error;
  }
  // Any HTTP response is terminal from this request's perspective, including a
  // server rejection. A later player action must intentionally get a new id.
  pendingMutationIds.delete(key);
  const body = await response.json().catch(() => ({}));
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
