import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { WorldTemplate } from '../worldProfile/worldTemplateTypes';

export interface ValidationIssue {
  ruleId: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  message: string;
  suggestedFix?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  metrics: {
    axiomCount: number;
    locationCount: number;
    characterCount: number;
    organizationCount: number;
    hiddenTruthCount: number;
    seedCount: number;
    graphConnected: boolean;
  };
}

export class WorldGenerationValidator {
  public static validateGeneratedWorld(
    profile: WorldProfile,
    axioms: WorldAxiom[],
    template: WorldTemplate
  ): ValidationReport {
    const issues: ValidationIssue[] = [];

    // 1. Profile Completeness
    if (!profile.display_name || profile.display_name.trim().length === 0) {
      issues.push({
        ruleId: 'PROFILE_DISPLAY_NAME_EMPTY',
        severity: 'ERROR',
        path: 'profile.display_name',
        message: 'World display name must not be empty.',
      });
    }

    if (!profile.world_description || profile.world_description.trim().length < 30) {
      issues.push({
        ruleId: 'PROFILE_DESCRIPTION_TOO_SHORT',
        severity: 'ERROR',
        path: 'profile.world_description',
        message: 'World description must be at least 30 characters long.',
      });
    }

    // 2. Axioms Count
    if (axioms.length < 4 || axioms.length > 12) {
      issues.push({
        ruleId: 'AXIOMS_COUNT_OUT_OF_RANGE',
        severity: 'ERROR',
        path: 'axioms',
        message: `Axioms count must be between 4 and 12, got ${axioms.length}.`,
      });
    }

    // 3. Axioms Immutable
    for (let i = 0; i < axioms.length; i++) {
      if (!axioms[i].immutable) {
        issues.push({
          ruleId: 'AXIOM_NOT_IMMUTABLE',
          severity: 'ERROR',
          path: `axioms[${i}].immutable`,
          message: `Axiom "${axioms[i].id}" must have immutable set to true.`,
        });
      }
    }

    // 4. Forbidden Concepts Complete Scan
    const forbiddenList = Array.from(
      new Set([
        ...(profile.forbidden_concepts || []),
        ...((profile as any).forbiddenElements || []),
      ])
    ).map((f) => f.trim().toLowerCase()).filter(Boolean);

    if (forbiddenList.length > 0) {
      const inspectString = (text: string, pathStr: string) => {
        if (!text) return;
        const lower = text.toLowerCase();
        for (const forbidden of forbiddenList) {
          if (lower.includes(forbidden)) {
            issues.push({
              ruleId: 'FORBIDDEN_CONCEPT_PRESENT',
              severity: 'ERROR',
              path: pathStr,
              message: `Contains forbidden concept "${forbidden}".`,
              suggestedFix: `Remove or replace forbidden term "${forbidden}".`,
            });
          }
        }
      };

      inspectString(profile.world_description, 'profile.world_description');
      template.locations.forEach((l) => {
        inspectString(l.name, `locations[${l.id}].name`);
        inspectString(l.description, `locations[${l.id}].description`);
      });
      template.characters.forEach((c) => {
        inspectString(c.name, `characters[${c.id}].name`);
        inspectString(c.title, `characters[${c.id}].title`);
        inspectString(c.species, `characters[${c.id}].species`);
      });
      template.organizations.forEach((o) => {
        inspectString(o.name, `organizations[${o.id}].name`);
        inspectString(o.description, `organizations[${o.id}].description`);
      });
      template.hiddenTruths.forEach((ht) => {
        inspectString(ht.title, `hiddenTruths[${ht.id}].title`);
        inspectString(ht.true_nature, `hiddenTruths[${ht.id}].true_nature`);
      });
      template.facts.forEach((f) => {
        inspectString(f.statement, `facts[${f.id}].statement`);
      });
    }

    // 5. Required Concepts Complete Scan
    const requiredList = Array.from(
      new Set([
        ...(profile.allowed_concepts || []),
        ...((profile as any).required_concepts || []),
        ...((profile as any).requiredElements || []),
      ])
    ).map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (requiredList.length > 0) {
      // Gather all text in world
      const allWorldText = [
        profile.display_name,
        profile.world_description,
        ...template.locations.map((l) => `${l.name} ${l.description}`),
        ...template.characters.map((c) => `${c.name} ${c.title} ${c.species} ${c.goal.primary}`),
        ...template.organizations.map((o) => `${o.name} ${o.description}`),
        ...template.hiddenTruths.map((ht) => `${ht.title} ${ht.true_nature}`),
        ...template.facts.map((f) => f.statement),
        ...template.seeds.map((s) => s.visible_layer.description),
      ].join(' ').toLowerCase();

      for (const required of requiredList) {
        if (!allWorldText.includes(required)) {
          issues.push({
            ruleId: 'REQUIRED_CONCEPT_MISSING',
            severity: 'WARNING',
            path: 'world',
            message: `Required user concept "${required}" is missing from generated world.`,
            suggestedFix: `Inject concept "${required}" into world facts or locations.`,
          });
        }
      }
    }

    // 6. Locations Graph & Connectivity
    const locationIds = new Set(template.locations.map((l) => l.id));
    template.locations.forEach((l) => {
      l.connected_to.forEach((connId) => {
        if (!locationIds.has(connId)) {
          issues.push({
            ruleId: 'LOCATION_INVALID_CONNECTED_TO',
            severity: 'ERROR',
            path: `locations[${l.id}].connected_to`,
            message: `Location "${l.id}" references non-existent connected location "${connId}".`,
          });
        }
      });
    });

    // Check Graph Connectivity (BFS)
    let graphConnected = true;
    if (template.locations.length > 0) {
      const startId = template.locations[0].id;
      const visited = new Set<string>([startId]);
      const queue = [startId];

      const adj = new Map<string, Set<string>>();
      template.locations.forEach((l) => adj.set(l.id, new Set(l.connected_to)));
      template.locationEdges.forEach((e) => {
        if (!adj.has(e.from_location_id)) adj.set(e.from_location_id, new Set());
        adj.get(e.from_location_id)!.add(e.to_location_id);
      });

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adj.get(curr) || new Set();
        neighbors.forEach((nbr) => {
          if (!visited.has(nbr) && locationIds.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        });
      }

      if (visited.size !== locationIds.size) {
        graphConnected = false;
        issues.push({
          ruleId: 'LOCATION_GRAPH_DISCONNECTED',
          severity: 'ERROR',
          path: 'locations',
          message: `Location graph is disconnected. Visited ${visited.size}/${locationIds.size} locations.`,
          suggestedFix: 'Connect orphan locations to the main location graph.',
        });
      }
    }

    // 7. Edge Symmetry
    const edgePairs = new Set(template.locationEdges.map((e) => `${e.from_location_id}->${e.to_location_id}`));
    template.locationEdges.forEach((e) => {
      const reverseKey = `${e.to_location_id}->${e.from_location_id}`;
      if (!edgePairs.has(reverseKey)) {
        issues.push({
          ruleId: 'EDGE_NOT_BIDIRECTIONAL',
          severity: 'WARNING',
          path: `locationEdges[${e.id}]`,
          message: `Edge ${e.from_location_id} -> ${e.to_location_id} lacks symmetric reverse edge.`,
          suggestedFix: 'Add reverse edge.',
        });
      }
    });

    // 8. Characters Validation
    const pcCount = template.characters.filter((c) => c.type === 'PC').length;
    if (pcCount !== 1) {
      issues.push({
        ruleId: 'EXACTLY_ONE_PC_REQUIRED',
        severity: 'ERROR',
        path: 'characters',
        message: `Must have exactly 1 PC, found ${pcCount}.`,
      });
    }

    const characterIds = new Set(template.characters.map((c) => c.id));
    template.characters.forEach((c) => {
      if (!c.location_id || !locationIds.has(c.location_id)) {
        issues.push({
          ruleId: 'CHARACTER_INVALID_LOCATION',
          severity: 'ERROR',
          path: `characters[${c.id}].location_id`,
          message: `Character "${c.name}" (${c.id}) has invalid location "${c.location_id}".`,
        });
      }
    });

    // 9. Organizations Validation
    template.organizations.forEach((o) => {
      if (o.headquarters_id && !locationIds.has(o.headquarters_id)) {
        issues.push({
          ruleId: 'ORGANIZATION_INVALID_HQ',
          severity: 'ERROR',
          path: `organizations[${o.id}].headquarters_id`,
          message: `Organization "${o.name}" has invalid headquarters_id "${o.headquarters_id}".`,
        });
      }
      if (o.leader_id && !characterIds.has(o.leader_id)) {
        issues.push({
          ruleId: 'ORGANIZATION_INVALID_LEADER',
          severity: 'ERROR',
          path: `organizations[${o.id}].leader_id`,
          message: `Organization "${o.name}" has invalid leader_id "${o.leader_id}".`,
        });
      }
    });

    // 10. Hidden Truths Layer Coverage
    const layers = new Set(template.hiddenTruths.map((ht) => ht.layer));
    if (layers.size < 3) {
      issues.push({
        ruleId: 'HIDDEN_TRUTHS_INSUFFICIENT_LAYERS',
        severity: 'ERROR',
        path: 'hiddenTruths',
        message: `Hidden truths must cover at least 3 distinct layers, found ${layers.size}.`,
      });
    }

    // 11. Seeds Linked to Hidden Truths
    const truthIds = new Set(template.hiddenTruths.map((ht) => ht.id));
    template.seeds.forEach((s) => {
      const truthId = s.hidden_truth?.id;
      if (!truthId || !truthIds.has(truthId)) {
        issues.push({
          ruleId: 'SEED_UNLINKED_HIDDEN_TRUTH',
          severity: 'ERROR',
          path: `seeds[${s.id}].hidden_truth`,
          message: `Seed "${s.id}" has invalid or missing hidden_truth "${truthId}".`,
        });
      }
    });

    const hasErrors = issues.some((i) => i.severity === 'ERROR');

    return {
      valid: !hasErrors,
      issues,
      metrics: {
        axiomCount: axioms.length,
        locationCount: template.locations.length,
        characterCount: template.characters.length,
        organizationCount: template.organizations.length,
        hiddenTruthCount: template.hiddenTruths.length,
        seedCount: template.seeds.length,
        graphConnected,
      },
    };
  }
}
