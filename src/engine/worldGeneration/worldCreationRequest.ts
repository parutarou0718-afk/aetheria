export type StartingScale = 'LOCAL' | 'REGIONAL' | 'CONTINENTAL';

export interface WorldCreationConstraints {
  tone?: string;
  culturalInfluences?: string[];
  technologyLevel?: string;
  supernaturalLevel?: string;

  requiredElements?: string[];
  forbiddenElements?: string[];
  required_concepts?: string[];
  forbidden_concepts?: string[];

  playerFantasy?: string;
  startingScale?: StartingScale;

  desiredLocationCount?: number;
  desiredCharacterCount?: number;
  desiredOrganizationCount?: number;
}

export interface WorldCreationRequest {
  worldId: string;
  userVision: string;
  constraints?: WorldCreationConstraints;
  generationSeed: number;
}

export interface RequestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorldCreationRequest(request: WorldCreationRequest): RequestValidationResult {
  const errors: string[] = [];

  if (!request.worldId || request.worldId.trim().length === 0) {
    errors.push('worldId must not be empty.');
  }

  if (!request.userVision || request.userVision.trim().length < 20) {
    errors.push('userVision must be at least 20 characters long.');
  }

  if (!Number.isInteger(request.generationSeed) || !Number.isSafeInteger(request.generationSeed)) {
    errors.push('generationSeed must be a safe integer.');
  }

  if (request.constraints) {
    const requiredList = [
      ...(request.constraints.requiredElements || []),
      ...(request.constraints.required_concepts || []),
    ];
    const forbiddenList = [
      ...(request.constraints.forbiddenElements || []),
      ...(request.constraints.forbidden_concepts || []),
    ];
    const reqNormalized = new Set(requiredList.map((s) => s.trim().toLowerCase()).filter(Boolean));
    const forbNormalized = new Set(forbiddenList.map((s) => s.trim().toLowerCase()).filter(Boolean));

    for (const reqItem of reqNormalized) {
      if (forbNormalized.has(reqItem)) {
        errors.push(`requiredElements and forbiddenElements cannot contain the same normalized entry: "${reqItem}"`);
      }
    }

    if (request.constraints.desiredLocationCount !== undefined) {
      if (request.constraints.desiredLocationCount < 2 || request.constraints.desiredLocationCount > 20) {
        errors.push('desiredLocationCount must be between 2 and 20.');
      }
    }

    if (request.constraints.desiredCharacterCount !== undefined) {
      if (request.constraints.desiredCharacterCount < 2 || request.constraints.desiredCharacterCount > 30) {
        errors.push('desiredCharacterCount must be between 2 and 30.');
      }
    }

    if (request.constraints.desiredOrganizationCount !== undefined) {
      if (request.constraints.desiredOrganizationCount < 1 || request.constraints.desiredOrganizationCount > 10) {
        errors.push('desiredOrganizationCount must be between 1 and 10.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
