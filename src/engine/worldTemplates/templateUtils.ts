import { WorldTemplate } from '../worldProfile/worldTemplateTypes';

export class TemplateValidationUtils {
  public static validate(template: WorldTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.profile || !template.profile.world_id) {
      errors.push('Template profile or world_id is missing.');
    }

    const locationIds = new Set(template.locations.map((l) => l.id));

    // Check characters location
    for (const char of template.characters) {
      if (char.location_id && !locationIds.has(char.location_id)) {
        errors.push(`Character ${char.id} references non-existent location_id ${char.location_id}`);
      }
    }

    // Check edges locations
    for (const edge of template.locationEdges) {
      if (!locationIds.has(edge.from_location_id)) {
        errors.push(`Location edge ${edge.id} references non-existent from_location_id ${edge.from_location_id}`);
      }
      if (!locationIds.has(edge.to_location_id)) {
        errors.push(`Location edge ${edge.id} references non-existent to_location_id ${edge.to_location_id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
