import { WorldGenre } from './worldProfileTypes';

export class WorldPresetParser {
  public static detect(input: string): WorldGenre | null {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    const upper = trimmed.toUpperCase();

    // Exact or direct matches
    if (upper === 'XIANXIA' || upper === 'PRESET-XIANXIA') return 'XIANXIA';
    if (upper === 'STEAM_ARCANUM' || upper === 'PRESET-STEAM-ARCANUM' || upper === 'STEAM') return 'STEAM_ARCANUM';
    if (upper === 'CYBERPUNK' || upper === 'PRESET-CYBERPUNK') return 'CYBERPUNK';
    if (upper === 'WASTELAND' || upper === 'PRESET-WASTELAND') return 'WASTELAND';

    // Substring matches
    if (trimmed.includes('东方修仙') || trimmed.includes('修仙') || trimmed.includes('仙侠') || trimmed.includes('苍穹道界')) {
      return 'XIANXIA';
    }
    if (trimmed.includes('蒸汽魔导') || trimmed.includes('蒸汽') || trimmed.includes('魔导') || trimmed.includes('艾尔德兰')) {
      return 'STEAM_ARCANUM';
    }
    if (trimmed.includes('赛博朋克') || trimmed.includes('赛博')) {
      return 'CYBERPUNK';
    }
    if (trimmed.includes('废土生存') || trimmed.includes('废土') || trimmed.includes('辐射')) {
      return 'WASTELAND';
    }

    return null;
  }
}
