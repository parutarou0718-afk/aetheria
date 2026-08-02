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
import { globalWorld, setRecorderWriteContext } from '../worldState';
import { WorldCacheLoader } from '../world/worldCacheLoader';

export interface GenesisResult {
  worldId: string;
  profile: any;
  axioms: any[];
  template: WorldTemplate;
  validationReport: ValidationReport;
  repaired: boolean;
  repairChanges: string[];
}

export class WorldGenesisService {
  public static async createDynamicWorld(request: WorldCreationRequest): Promise<GenesisResult> {
    // Step 1: Request Validation
    const reqValidation = validateWorldCreationRequest(request);
    if (!reqValidation.valid) {
      throw new WorldCreationRequestValidationError(reqValidation.errors.join('; '));
    }

    const worldId = request.worldId;
    const idFactory = new DeterministicIdFactory(request.generationSeed);

    // Step 2: Phase 1 - Profile & Axioms Generation
    const { profile, axioms } = await WorldProfileGenerator.generateProfileAndAxioms(request, idFactory);

    // Step 3: Phase 2 - Skeleton Generation
    const skeleton = WorldSkeletonGenerator.generateSkeleton(profile, axioms, idFactory);

    // Step 4: Phase 3 - Entity Generation
    const entities = WorldEntityGenerator.generateEntities(profile, skeleton, idFactory);

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

    // Step 7: Phase 6 - Atomic Persistence
    setRecorderWriteContext(true);
    try {
      // Clean previous data for this worldId atomically
      await WorldRepository.deleteWorldData(worldId);

      // Save new world snapshot
      await WorldRepository.saveWorldSnapshot(snapshot);

      // Save Profile & Axioms
      await WorldRepository.saveWorldProfile(worldId, profile);
      await WorldRepository.saveWorldAxioms(worldId, axioms);

      // Save Entities
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

      // Reload into in-memory globalWorld cache
      await WorldCacheLoader.loadWorldStateIntoCache(worldId);
    } finally {
      setRecorderWriteContext(false);
    }

    return {
      worldId,
      profile,
      axioms,
      template,
      validationReport,
      repaired,
      repairChanges,
    };
  }
}
