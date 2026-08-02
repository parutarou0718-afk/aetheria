import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { WorldTemplate } from '../worldProfile/worldTemplateTypes';
import { DeterministicIdFactory } from './deterministicIdFactory';

export class WorldGenerationRepair {
  public static repairGeneratedWorld(
    profile: WorldProfile,
    axioms: WorldAxiom[],
    template: WorldTemplate,
    idFactory: DeterministicIdFactory
  ): { profile: WorldProfile; axioms: WorldAxiom[]; template: WorldTemplate; repaired: boolean; changes: string[] } {
    const changes: string[] = [];

    // Derive profile terms for repairs
    const defaultTitle = profile.terminology?.professionTerms?.[0] || '行者';
    const defaultSpecies = profile.terminology?.creatureTerms?.[0] || profile.cultural_influences?.[0] || '世生灵';
    const defaultSettlement = profile.terminology?.settlementTerms?.[0] || '聚落';

    // 1. Repair Profile
    if (!profile.display_name || profile.display_name.trim().length === 0) {
      profile.display_name = '无名新界';
      changes.push('Repaired empty profile.display_name.');
    }

    if (!profile.world_description || profile.world_description.trim().length < 30) {
      profile.world_description = `${profile.display_name}是一个由独特的天然法则与人文历史构筑的崭新世界。各地势力林立，暗流涌动，等待探索者发掘其中隐藏的真相。`;
      changes.push('Repaired short profile.world_description.');
    }

    // 2. Repair Axioms
    for (let i = 0; i < axioms.length; i++) {
      if (!axioms[i].immutable) {
        axioms[i].immutable = true;
        changes.push(`Set axiom ${axioms[i].id} immutable to true.`);
      }
    }

    if (axioms.length < 4) {
      const defaultCategories: Array<WorldAxiom['category']> = ['COSMOLOGY', 'POWER', 'SOCIETY', 'ECONOMY'];
      while (axioms.length < 4) {
        const cat = defaultCategories[axioms.length % defaultCategories.length];
        const axiomId = idFactory.createId('axiom-repaired', axioms.length + 1);
        axioms.push({
          id: axiomId,
          world_id: profile.world_id,
          category: cat,
          statement: `本世界的${cat}规则遵循基本守恒与内在因果关联。`,
          consequences: ['影响万物运转机制'],
          immutable: true,
          created_at_epoch: 1,
        });
        changes.push(`Added required axiom ${axiomId} to meet minimum count of 4.`);
      }
    }

    // 3. Repair Locations & Graph Connectivity
    const locationMap = new Map(template.locations.map((l) => [l.id, l]));

    // Fix invalid location.connected_to
    template.locations.forEach((l) => {
      l.connected_to = l.connected_to.filter((connId) => locationMap.has(connId));
    });

    // Ensure edge symmetry and missing edges
    const existingEdgeKeys = new Set(template.locationEdges.map((e) => `${e.from_location_id}->${e.to_location_id}`));

    template.locationEdges.forEach((e) => {
      const reverseKey = `${e.to_location_id}->${e.from_location_id}`;
      if (!existingEdgeKeys.has(reverseKey) && locationMap.has(e.to_location_id) && locationMap.has(e.from_location_id)) {
        const revEdgeId = idFactory.createId('edge-rev', `${e.to_location_id}-${e.from_location_id}`);
        template.locationEdges.push({
          id: revEdgeId,
          world_id: profile.world_id,
          from_location_id: e.to_location_id,
          to_location_id: e.from_location_id,
          distance: e.distance || 1.0,
          travel_cost: e.travel_cost || 1.0,
          travel_time_epochs: e.travel_time_epochs || 1,
          status: 'OPEN',
        });
        existingEdgeKeys.add(reverseKey);

        const targetLoc = locationMap.get(e.to_location_id);
        if (targetLoc && !targetLoc.connected_to.includes(e.from_location_id)) {
          targetLoc.connected_to.push(e.from_location_id);
        }
        changes.push(`Added symmetric reverse edge ${reverseKey}.`);
      }
    });

    // Fix Graph Connectivity if disconnected
    if (template.locations.length > 1) {
      const startId = template.locations[0].id;
      const visited = new Set<string>([startId]);
      const queue = [startId];

      const adj = new Map<string, Set<string>>();
      template.locations.forEach((l) => adj.set(l.id, new Set(l.connected_to)));

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adj.get(curr) || new Set();
        neighbors.forEach((nbr) => {
          if (!visited.has(nbr) && locationMap.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        });
      }

      if (visited.size < template.locations.length) {
        // Connect unvisited locations to start location
        template.locations.forEach((l) => {
          if (!visited.has(l.id)) {
            l.connected_to.push(startId);
            template.locations[0].connected_to.push(l.id);

            const e1 = idFactory.createId('edge-conn', `${l.id}-${startId}`);
            const e2 = idFactory.createId('edge-conn', `${startId}-${l.id}`);

            template.locationEdges.push({
              id: e1,
              world_id: profile.world_id,
              from_location_id: l.id,
              to_location_id: startId,
              distance: 1.0,
              travel_cost: 1.0,
              travel_time_epochs: 1,
              status: 'OPEN',
            });
            template.locationEdges.push({
              id: e2,
              world_id: profile.world_id,
              from_location_id: startId,
              to_location_id: l.id,
              distance: 1.0,
              travel_cost: 1.0,
              travel_time_epochs: 1,
              status: 'OPEN',
            });

            visited.add(l.id);
            changes.push(`Connected orphan location ${l.id} to main graph.`);
          }
        });
      }
    }

    // 4. Repair PC (Profile-Driven, No hardcoded "人类" / "探索者")
    const pcs = template.characters.filter((c) => c.type === 'PC');
    if (pcs.length === 0) {
      const firstLocId = template.locations[0]?.id || 'loc-start';
      const pcId = idFactory.createId('pc', 'player');
      template.characters.unshift({
        id: pcId,
        type: 'PC',
        name: '初游者',
        title: defaultTitle,
        species: defaultSpecies,
        age: 22,
        status: 'ALIVE',
        presence_state: 'AT_LOCATION',
        location_id: firstLocId,
        goal: { primary: `探索${profile.display_name}并寻获法则本源`, secondary: [] },
        personality: ['果敢', '好奇'],
        fear: '迷失在未知中',
        attributes: { hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 10, dexterity: 10, intelligence: 10, charisma: 10 },
        skills: { '基础感知': 10, '地形辨识': 10 },
        resources: { gold: 50, reputation: 0 },
        inventory: [{ item_id: 'item-bag', name: '随身物品', quantity: 1, type: 'MISC' }],
        knowledge: { known_facts: [], known_characters: [], known_locations: [firstLocId] },
        memory: { short_term: [{ text: '踏上了新的旅途', importance: 5, epoch: 1 }], compressed: '', important_events: [] },
        relationships: [],
        current_action: { type: 'IDLE', description: '正在观察周围的环境', started_at_epoch: 1, estimated_end_epoch: 1 },
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      });
      changes.push(`Created profile-driven PC character ${pcId} (species: ${defaultSpecies}, title: ${defaultTitle}).`);
    } else if (pcs.length > 1) {
      for (let i = 1; i < pcs.length; i++) {
        pcs[i].type = 'NPC';
        changes.push(`Downgraded duplicate PC ${pcs[i].id} to NPC.`);
      }
    }

    // Fix character location_ids
    template.characters.forEach((c) => {
      if (!c.location_id || !locationMap.has(c.location_id)) {
        c.location_id = template.locations[0]?.id || 'loc-start';
        changes.push(`Repaired location_id for character ${c.id}.`);
      }
    });

    // 5. Repair Hidden Truths and Seeds
    if (template.hiddenTruths.length === 0) {
      const htId = idFactory.createId('ht', 1);
      template.hiddenTruths.push({
        id: htId,
        title: `${profile.display_name}的深层法则秘辛`,
        layer: 'layer_1_personal_secrets',
        layer_name: '个人秘密',
        exists: true,
        true_nature: `关于${defaultSettlement}与法则运行的深层原委。`,
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['古旧线索'],
        evidence_collected: [],
      });
      changes.push(`Added profile-driven hidden truth ${htId}.`);
    }

    const truthMap = new Map(template.hiddenTruths.map((ht) => [ht.id, ht]));
    template.seeds.forEach((s) => {
      if (!s.hidden_truth?.id || !truthMap.has(s.hidden_truth.id)) {
        s.hidden_truth = template.hiddenTruths[0];
        changes.push(`Repaired seed ${s.id} to reference valid hidden truth ${s.hidden_truth.id}.`);
      }
    });

    // 6. Inject Missing Required Concepts
    const requiredTerms = (profile.allowed_concepts || []).map((r) => r.trim()).filter((r) => r.length > 0);
    if (requiredTerms.length > 0) {
      const allWorldText = [
        profile.display_name,
        profile.world_description,
        ...template.locations.map((l) => `${l.name} ${l.description}`),
        ...template.characters.map((c) => `${c.name} ${c.title} ${c.species} ${c.goal.primary}`),
        ...template.organizations.map((o) => `${o.name} ${o.description}`),
        ...template.hiddenTruths.map((ht) => `${ht.title} ${ht.true_nature}`),
        ...template.facts.map((f) => f.statement),
      ].join(' ').toLowerCase();

      for (const req of requiredTerms) {
        if (!allWorldText.includes(req.toLowerCase())) {
          // Inject missing concept into facts and first location
          const newFactId = idFactory.createId('fact-req', Date.now());
          template.facts.push({
            id: newFactId,
            statement: `在${profile.display_name}中，与"${req}"相关的法则与传闻被世人广为关注。`,
            category: 'SOCIAL',
            confidence: 'CONFIRMED',
            source: { type: 'OBSERVATION', source_id: template.locations[0]?.id || 'loc-1', epoch_discovered: 1 },
            related_entity_ids: [template.locations[0]?.id || 'loc-1'],
            is_active: true,
            created_at_epoch: 1,
            updated_at_epoch: 1,
          });
          changes.push(`Injected missing required concept "${req}" into world facts.`);
        }
      }
    }

    // 7. Repair Forbidden Concept Violations
    const forbiddenTerms = (profile.forbidden_concepts || []).map((f) => f.trim()).filter((f) => f.length > 0);
    if (forbiddenTerms.length > 0) {
      const replaceForbidden = (text: string) => {
        let res = text;
        for (const term of forbiddenTerms) {
          const reg = new RegExp(term, 'gi');
          if (reg.test(res)) {
            res = res.replace(reg, '未知事物');
            changes.push(`Replaced forbidden term "${term}" in text.`);
          }
        }
        return res;
      };

      profile.world_description = replaceForbidden(profile.world_description);
      template.locations.forEach((l) => {
        l.name = replaceForbidden(l.name);
        l.description = replaceForbidden(l.description);
      });
      template.characters.forEach((c) => {
        c.name = replaceForbidden(c.name);
        c.title = replaceForbidden(c.title);
        c.species = replaceForbidden(c.species);
      });
      template.organizations.forEach((o) => {
        o.name = replaceForbidden(o.name);
        o.description = replaceForbidden(o.description);
      });
      template.facts.forEach((f) => {
        f.statement = replaceForbidden(f.statement);
      });
    }

    return {
      profile,
      axioms,
      template,
      repaired: changes.length > 0,
      changes,
    };
  }
}
