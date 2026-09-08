import { dbManager } from '../../engine/persistence/database';

export interface PlayerRequestKey { worldId: string; sessionId: string; requestId: string; actionKey: string; }
type ClaimResult =
  | { kind: 'CLAIMED' }
  | { kind: 'IN_PROGRESS' }
  | { kind: 'UNKNOWN' }
  | { kind: 'REPLAY'; httpStatus: number; response: unknown };

interface RequestRow { status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'UNKNOWN'; http_status: number | null; response_json: string | null; }

/** Persistent idempotency is a sidecar: it never decides or writes world truth. */
export class PlayerRequestRunRepository {
  static async pruneTerminal(maxRows = 5_000, olderThanMs = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    // Only terminal rows are disposable. Unknown and in-flight requests retain
    // their ambiguity rather than becoming replayable through maintenance.
    await dbManager.run(`DELETE FROM player_request_runs WHERE id IN (
      SELECT id FROM player_request_runs
      WHERE status IN ('COMPLETED', 'FAILED')
        AND (updated_at < ? OR id NOT IN (
          SELECT id FROM player_request_runs WHERE status IN ('COMPLETED', 'FAILED') ORDER BY updated_at DESC LIMIT ?
        ))
    )`, [cutoff, maxRows]);
  }
  static async claim(input: PlayerRequestKey): Promise<ClaimResult> {
    const now = new Date().toISOString();
    try {
      await dbManager.run(
        "INSERT INTO player_request_runs (id, world_id, session_id, request_id, action_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)",
        [crypto.randomUUID(), input.worldId, input.sessionId, input.requestId, input.actionKey, now, now],
      );
      return { kind: 'CLAIMED' };
    } catch (error) {
      if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
    const existing = await dbManager.get<RequestRow>(
      'SELECT status, http_status, response_json FROM player_request_runs WHERE session_id = ? AND request_id = ? AND action_key = ?',
      [input.sessionId, input.requestId, input.actionKey],
    );
    if (!existing || existing.status === 'IN_PROGRESS') return { kind: 'IN_PROGRESS' };
    if (existing.status === 'UNKNOWN') return { kind: 'UNKNOWN' };
    return { kind: 'REPLAY', httpStatus: existing.http_status ?? 500, response: existing.response_json ? JSON.parse(existing.response_json) : { status: 'error', code: 'INTERNAL_ERROR', error: 'The request could not be completed.' } };
  }

  static async complete(input: PlayerRequestKey, result: { httpStatus: number; response: unknown; errorCode?: string }): Promise<void> {
    const status = result.httpStatus >= 400 ? 'FAILED' : 'COMPLETED';
    const updated = await dbManager.run(
      'UPDATE player_request_runs SET status = ?, http_status = ?, response_json = ?, error_code = ?, updated_at = ? WHERE world_id = ? AND session_id = ? AND request_id = ? AND action_key = ? AND status = \'IN_PROGRESS\'',
      [status, result.httpStatus, JSON.stringify(result.response), result.errorCode ?? null, new Date().toISOString(), input.worldId, input.sessionId, input.requestId, input.actionKey],
    );
    if (!updated.changes) throw new Error('PLAYER_REQUEST_RUN_FINALIZATION_CONFLICT');
    try { await this.pruneTerminal(); } catch { /* best-effort maintenance */ }
  }

  static async markInProgressUnknown(): Promise<void> {
    await dbManager.run("UPDATE player_request_runs SET status = 'UNKNOWN', updated_at = ? WHERE status = 'IN_PROGRESS'", [new Date().toISOString()]);
  }
}
