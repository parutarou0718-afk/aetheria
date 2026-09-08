// audit-direct-write: allow-file
import { WorldCreationRequest, validateWorldCreationRequest } from './worldCreationRequest';
import { WorldCreationRequestValidationError, WorldGenerationFailureError } from '../worldProfile/worldProfileErrors';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { WorldProfileGenerator } from './worldProfileGenerator';
import { WorldSkeletonGenerator } from './worldSkeletonGenerator';
import { WorldEntityGenerator } from './worldEntityGenerator';
import { WorldGenerationValidator, ValidationReport } from './worldGenerationValidator';
import { WorldGenerationRepair } from './worldGenerationRepair';
import { WorldRepository } from '../world/worldRepository';
import { WorldTemplate } from '../worldProfile/worldTemplateTypes';
import { WorldSnapshot } from '../../types';
import { setRecorderWriteContext } from '../worldState';
import { WorldCacheLoader } from '../world/worldCacheLoader';
import { dbManager } from '../persistence/database';
import { worldLifecycleLock } from '../world/worldLifecycleLock';
import { runtimeHealth } from '../runtime/runtimeHealthService';

export interface GenesisResult {
  worldId: string;
  profile: any;
  axioms: any[];
  template: WorldTemplate;
  validationReport: ValidationReport;
  repaired: boolean;
  repairChanges: string[];
  warnings?: string[];
}

export class WorldGenesisService {
  public static async createDynamicWorld(request: WorldCreationRequest): Promise<GenesisResult> {
    return worldLifecycleLock.runExclusive(request.worldId, 'GENESIS', () => this.createDynamicWorldUnlocked(request));
  }

  private static async createDynamicWorldUnlocked(request: WorldCreationRequest): Promise<GenesisResult> {
    // Step 1: Request Validation
    const reqValidation = validateWorldCreationRequest(request);
    if (!reqValidation.valid) {
      throw new WorldCreationRequestValidationError(reqValidation.errors.join('; '));
    }

    const worldId = request.worldId;
    const idFactory = new DeterministicIdFactory(request.generationSeed);

    // Step 2: Phase 1 - Profile & Axioms Generation
    const { profile, axioms } = await WorldProfileGenerator.generateProfileAndAxioms(request, idFactory);

    // Step 3: Phase 2 - Skeleton Generation (AI / Dynamic)
    const skeleton = await WorldSkeletonGenerator.generateSkeleton(profile, axioms, idFactory);

    // Step 4: Phase 3 - Entity Generation (AI / Dynamic)
    const entities = await WorldEntityGenerator.generateEntities(profile, skeleton, idFactory);

    const snapshot: WorldSnapshot = {
      id: worldId,
      world_name: profile.display_name,
      world_description: profile.world_description,
      world_creation_state: 'CREATED',
      epoch: 1,
      seed: request.generationSeed,
      created_at: new Date().toISOString(),
      world_facts_count: entities.facts.length,
      characters_count: entities.characters.length,
      organizations_count: entities.organizations.length,
      locations_count: skeleton.locations.length,
      active_seeds_count: entities.seeds.length,
      frozen_objects_count: 0,
      completed_epochs: 0,
    };

    let template: WorldTemplate = {
      profile,
      snapshot,
      characters: entities.characters,
      locations: skeleton.locations,
      locationEdges: skeleton.locationEdges,
      organizations: entities.organizations,
      facts: entities.facts,
      hiddenTruths: skeleton.hiddenTruths,
      seeds: entities.seeds,
      events: entities.events,
    };

    // Step 5: Phase 4 - Validation
    let validationReport = WorldGenerationValidator.validateGeneratedWorld(profile, axioms, template);

    let repaired = false;
    let repairChanges: string[] = [];

    // Step 6: Phase 5 - Repair if needed
    if (!validationReport.valid) {
      const repairRes = WorldGenerationRepair.repairGeneratedWorld(profile, axioms, template, idFactory);
      repaired = repairRes.repaired;
      repairChanges = repairRes.changes;

      validationReport = WorldGenerationValidator.validateGeneratedWorld(profile, axioms, template);
      if (!validationReport.valid) {
        throw new WorldGenerationFailureError(
          `World generation validation failed after repair: ${validationReport.issues.map((i) => i.message).join('; ')}`
        );
      }
    }

    // Step 7: Phase 6 - Atomic Persistence in Single SQL Transaction
    setRecorderWriteContext(true);
    try {
      await dbManager.transaction(async () => {
        // Clean previous data for this worldId
        await WorldRepository.deleteWorldData(worldId);

        // Save new world snapshot
        await WorldRepository.saveWorldSnapshot(snapshot);

        // Save Profile & Axioms
        await WorldRepository.saveWorldProfile(worldId, profile);
        await WorldRepository.saveWorldAxioms(worldId, axioms);

        // Save Skeleton & Entities
        for (const loc of template.locations) {
          await WorldRepository.saveLocation(worldId, loc);
        }
        for (const edge of template.locationEdges) {
          await WorldRepository.saveLocationEdge(worldId, edge);
        }
        for (const char of template.characters) {
          await WorldRepository.saveCharacter(worldId, char);
        }
        for (const org of template.organizations) {
          await WorldRepository.saveOrganization(worldId, org);
        }
        for (const fact of template.facts) {
          await WorldRepository.saveFact(worldId, fact);
        }
        for (const truth of template.hiddenTruths) {
          await WorldRepository.saveHiddenTruth(worldId, truth);
        }
        for (const seed of template.seeds) {
          await WorldRepository.saveSeed(worldId, seed);
        }
        for (const evt of template.events) {
          await WorldRepository.saveEvent(worldId, evt);
        }
      });

    } finally {
      setRecorderWriteContext(false);
    }

    // The world is durable once the transaction completes. Cache publication is
    // deliberately post-commit: a reload failure degrades readiness, not truth.
    const warnings: string[] = [];
    try { await WorldCacheLoader.loadWorldStateIntoCache(worldId); }
    catch {
      runtimeHealth.markCacheUnsynchronized();
      warnings.push('World creation committed, but the runtime cache is not ready yet.');
    }

    return {
      worldId,
      profile,
      axioms,
      template,
      validationReport,
      repaired,
      repairChanges,
      warnings: warnings.length ? warnings : undefined,
    };
  }
}
