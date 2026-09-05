import { WorldProfile } from './worldProfile/worldProfileTypes';

/**
 * Neutral fallback label used whenever no World Profile is present. The world is
 * an "AI Native 永恒世界 RPG" — we never hardcode "Dungeon Master" / "地下城主",
 * which would leak Western TRPG branding into custom world theming.
 */
export const DEFAULT_NARRATOR_ROLE = '世界演算者';

/**
 * Resolve the narrator role for a world.
 *
 * - Returns the profile's `narrative_style.narratorRole` when set (trimmed).
 * - Otherwise falls back to the neutral `世界演算者`.
 *
 * This is a pure selector so it can be unit-tested without any live model.
 */
export function resolveNarratorRole(profile: WorldProfile | null | undefined): string {
  const role = profile?.narrative_style?.narratorRole;
  if (typeof role === 'string' && role.trim().length > 0) {
    return role.trim();
  }
  return DEFAULT_NARRATOR_ROLE;
}

/**
 * First line of the DM system prompt. Uses the resolved (profile-driven) role.
 */
export function buildDmPromptHeader(narratorRole: string): string {
  return `你是一个 AI Native 永恒世界 RPG 的全知【${narratorRole}】。`;
}

/**
 * Fallback narration for when no LLM key is configured. Uses the dynamic role.
 */
export function buildDmFallbackNarration(narratorRole: string, playerActionText: string, locationName: string, npcNames: string[]): string {
  return `【${narratorRole} 提示】(未检测到 GEMINI_API_KEY，使用基础规则反馈)\n你尝试执行了动作：“${playerActionText}”。在 ${locationName || '未知区域'} 的静谧氛围中，周围的 ${npcNames.join('、') || '环境'} 保持着警惕。世界法则持续运转。`;
}

/**
 * Error narration for exceptions thrown while resolving an action.
 */
export function buildDmErrorNarration(narratorRole: string): string {
  return `【${narratorRole} 提示】你静立片刻，隐隐察觉四周变局... (动作解析遇到微弱扰动)`;
}
