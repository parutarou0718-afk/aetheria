export class WorldProfileError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'WorldProfileError';
  }
}

export class WorldPresetNotFoundError extends WorldProfileError {
  constructor(preset: string) {
    super(`World preset not found: ${preset}`, 'WORLD_PRESET_NOT_FOUND');
    this.name = 'WorldPresetNotFoundError';
  }
}

export class WorldPresetRequiredError extends WorldProfileError {
  constructor() {
    super('World preset parameter is required', 'WORLD_PRESET_REQUIRED');
    this.name = 'WorldPresetRequiredError';
  }
}

export class GenreConsistencyViolationError extends WorldProfileError {
  constructor(public violations: Array<{ concept: string; path?: string; reason: string }>) {
    super(`Genre consistency violation: ${violations.map((v) => v.concept).join(', ')}`, 'GENRE_CONSISTENCY_VIOLATION');
    this.name = 'GenreConsistencyViolationError';
  }
}

export class WorldCreationRequestValidationError extends WorldProfileError {
  constructor(reason: string) {
    super(`World creation request validation error: ${reason}`, 'WORLD_CREATION_REQUEST_INVALID');
    this.name = 'WorldCreationRequestValidationError';
  }
}

export class WorldGenerationFailureError extends WorldProfileError {
  constructor(reason: string, code = 'WORLD_GENERATION_FAILED') {
    super(`World generation failure: ${reason}`, code);
    this.name = 'WorldGenerationFailureError';
  }
}

/** Profile generation failed — NEVER fabricate a fake world. */
export class WorldProfileGenerationError extends WorldProfileError {
  constructor(reason: string) {
    super(`World profile generation failed: ${reason}`, 'WORLD_PROFILE_GENERATION_FAILED');
    this.name = 'WorldProfileGenerationError';
  }
}

/** Skeleton generation failed — NEVER fabricate a fake map. */
export class WorldSkeletonGenerationError extends WorldProfileError {
  constructor(reason: string) {
    super(`World skeleton generation failed: ${reason}`, 'WORLD_SKELETON_GENERATION_FAILED');
    this.name = 'WorldSkeletonGenerationError';
  }
}

/** Entity generation failed — NEVER fabricate fake actors. */
export class WorldEntityGenerationError extends WorldProfileError {
  constructor(reason: string) {
    super(`World entity generation failed: ${reason}`, 'WORLD_ENTITY_GENERATION_FAILED');
    this.name = 'WorldEntityGenerationError';
  }
}
