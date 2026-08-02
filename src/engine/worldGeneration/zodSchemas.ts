import { z } from 'zod';

export const ZodWorldAxiom = z.object({
  category: z.enum(['COSMOLOGY', 'POWER', 'DEATH', 'TIME', 'GEOGRAPHY', 'SOCIETY', 'ECONOMY', 'BIOLOGY', 'TECHNOLOGY']).catch('COSMOLOGY'),
  statement: z.string(),
  consequences: z.array(z.string()).default([]),
});

export const ZodWorldProfileOutput = z.object({
  displayName: z.string().min(1),
  shortPitch: z.string().min(1),
  worldDescription: z.string().min(10),
  genreLabels: z.array(z.string()).default([]),
  toneLabels: z.array(z.string()).default([]),
  culturalInfluences: z.array(z.string()).default([]),
  cosmology: z.string().default(''),
  metaphysics: z.string().default(''),
  powerSystem: z.string().default(''),
  powerCosts: z.string().default(''),
  deathRules: z.string().default(''),
  timeRules: z.string().default(''),
  socialStructure: z.string().default(''),
  politicalStructure: z.string().default(''),
  economySystem: z.string().default(''),
  technologyModel: z.string().default(''),
  geographyModel: z.string().default(''),
  namingConventions: z.object({
    personalNames: z.string().default(''),
    placeNames: z.string().default(''),
    organizationNames: z.string().default(''),
    titles: z.string().default(''),
  }).default({ personalNames: '', placeNames: '', organizationNames: '', titles: '' }),
  terminology: z.object({
    currencyTerms: z.array(z.string()).default([]),
    energyTerms: z.array(z.string()).default([]),
    professionTerms: z.array(z.string()).default([]),
    factionTerms: z.array(z.string()).default([]),
    settlementTerms: z.array(z.string()).default([]),
    wildernessTerms: z.array(z.string()).default([]),
    creatureTerms: z.array(z.string()).default([]),
    artifactTerms: z.array(z.string()).default([]),
    socialRankTerms: z.array(z.string()).default([]),
    conflictTerms: z.array(z.string()).default([]),
  }).default({
    currencyTerms: [],
    energyTerms: [],
    professionTerms: [],
    factionTerms: [],
    settlementTerms: [],
    wildernessTerms: [],
    creatureTerms: [],
    artifactTerms: [],
    socialRankTerms: [],
    conflictTerms: [],
  }),
  narrativeStyle: z.object({
    narratorRole: z.string().default(''),
    voice: z.string().default(''),
    proseRules: z.array(z.string()).default([]),
    prohibitedStylePatterns: z.array(z.string()).default([]),
  }).default({ narratorRole: '', voice: '', proseRules: [], prohibitedStylePatterns: [] }),
  allowedConcepts: z.array(z.string()).default([]),
  forbiddenConcepts: z.array(z.string()).default([]),
  axioms: z.array(ZodWorldAxiom).default([]),
});

export const ZodSkeletonLocation = z.object({
  idKey: z.string(), // e.g. 'start', 'market', 'wilds', 'core'
  name: z.string().min(1),
  type: z.enum(['TOWN', 'CITY', 'FOREST', 'CAVE', 'MOUNTAIN', 'RUINS', 'PORT', 'FORTRESS', 'TEMPLE', 'WASTELAND', 'STATION', 'VOID', 'OTHER']).catch('OTHER'),
  description: z.string(),
  population: z.number().default(50),
  connectedToKeyIds: z.array(z.string()).default([]),
  primaryIndustry: z.string().default('TRADE'),
  tradeGoods: z.array(z.string()).default([]),
  featureName: z.string().default('中心地标'),
  featureDescription: z.string().default('主要活动区域'),
});

export const ZodHiddenTruth = z.object({
  title: z.string().min(1),
  layer: z.enum(['layer_1_personal_secrets', 'layer_2_organization_conspiracies', 'layer_3_world_lies', 'layer_4_cosmic_illusions']),
  layerName: z.string().default('深层真相'),
  trueNature: z.string().min(1),
  evidenceRequired: z.array(z.string()).default([]),
});

export const ZodSkeletonOutput = z.object({
  locations: z.array(ZodSkeletonLocation).min(2),
  hiddenTruths: z.array(ZodHiddenTruth).min(3),
});

export const ZodInventoryItem = z.object({
  item_id: z.string(),
  name: z.string(),
  type: z.enum(['WEAPON', 'ARMOR', 'CONSUMABLE', 'KEY_ITEM', 'MISC']).catch('MISC'),
  quantity: z.number().default(1),
});

export const ZodCharacterInput = z.object({
  idKey: z.string(), // 'pc', 'npc1', 'npc2'
  type: z.enum(['PC', 'NPC']),
  name: z.string().min(1),
  title: z.string(),
  species: z.string(),
  age: z.number().default(25),
  locationKeyId: z.string(),
  primaryGoal: z.string(),
  personality: z.array(z.string()).default([]),
  fear: z.string().default(''),
  attributes: z.object({
    hp: z.number().default(100),
    max_hp: z.number().default(100),
    mp: z.number().default(50),
    max_mp: z.number().default(50),
    strength: z.number().default(10),
    dexterity: z.number().default(10),
    intelligence: z.number().default(10),
    charisma: z.number().default(10),
  }).default({ hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 10, dexterity: 10, intelligence: 10, charisma: 10 }),
  skills: z.record(z.string(), z.number()).default({}),
  resources: z.object({
    gold: z.number().default(100),
    reputation: z.number().default(0),
  }).default({ gold: 100, reputation: 0 }),
  inventory: z.array(ZodInventoryItem).default([]),
});

export const ZodOrganizationInput = z.object({
  name: z.string().min(1),
  type: z.enum(['GUILD', 'FACTION', 'SECT', 'CORPORATION', 'GOVERNMENT', 'CULT', 'ACADEMY', 'ALLIANCE']).catch('GUILD'),
  description: z.string(),
  headquartersLocationKeyId: z.string(),
  leaderCharacterKeyId: z.string(),
  goalDescription: z.string(),
  projectName: z.string(),
  projectDescription: z.string(),
});

export const ZodSeedInput = z.object({
  type: z.enum(['INVESTIGATION', 'CONFLICT', 'DISCOVERY', 'CRISIS']).catch('INVESTIGATION'),
  description: z.string(),
  hiddenTruthIndex: z.number().default(0),
  opportunityDescription: z.string(),
  discoveryCondition: z.string(),
});

export const ZodWorldFactInput = z.object({
  statement: z.string().min(1),
  category: z.enum(['GEOGRAPHY', 'HISTORY', 'MAGIC', 'POLITICS', 'CULTURE', 'FACTION', 'BIOLOGY', 'PHYSICS']).catch('GEOGRAPHY'),
});

export const ZodEntityOutput = z.object({
  characters: z.array(ZodCharacterInput).min(2),
  organizations: z.array(ZodOrganizationInput).min(1),
  facts: z.array(ZodWorldFactInput).min(1),
  seeds: z.array(ZodSeedInput).min(1),
  genesisEventDescription: z.string(),
});
