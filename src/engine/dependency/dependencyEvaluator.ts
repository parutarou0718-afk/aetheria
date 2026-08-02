import { WorldRepository } from '../world/worldRepository';
import {
  DependencyEdge,
  DependencyEvaluationResult,
  DependencyCondition,
} from './dependencyTypes';

export function getFieldValue(entity: unknown, fieldPath: string): unknown {
  if (entity === null || entity === undefined) {
    return undefined;
  }

  if (typeof entity !== 'object') {
    return undefined;
  }

  // Security checks against Prototype Pollution and arbitrary JS
  if (!fieldPath || typeof fieldPath !== 'string') {
    return undefined;
  }

  const parts = fieldPath.split('.');
  let current: any = entity;

  for (const part of parts) {
    if (
      part === '__proto__' ||
      part === 'constructor' ||
      part === 'prototype'
    ) {
      return undefined;
    }

    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    current = current[part];
  }

  if (typeof current === 'function') {
    return undefined;
  }

  return current;
}

export class DependencyEvaluator {
  static async evaluate(
    worldId: string,
    edge: DependencyEdge
  ): Promise<DependencyEvaluationResult> {
    const { target_type, target_id, expected_condition } = edge;

    let targetEntity: unknown = null;

    switch (target_type) {
      case 'CHARACTER':
        targetEntity = await WorldRepository.getCharacter(worldId, target_id);
        break;
      case 'LOCATION':
        targetEntity = await WorldRepository.getLocation(worldId, target_id);
        break;
      case 'ORGANIZATION':
        targetEntity = await WorldRepository.getOrganization(worldId, target_id);
        break;
      case 'LOCATION_EDGE':
        targetEntity = await WorldRepository.getLocationEdge(worldId, target_id);
        break;
      case 'WORLD_FACT':
        targetEntity = await WorldRepository.getFact(worldId, target_id);
        break;
      case 'HIDDEN_TRUTH':
        targetEntity = await WorldRepository.getHiddenTruth(worldId, target_id);
        break;
      case 'SEED':
        targetEntity = await WorldRepository.getSeed(worldId, target_id);
        break;
      case 'TRANSACTION':
        targetEntity = await WorldRepository.getWorldTransaction(worldId, target_id);
        break;
      default:
        targetEntity = null;
    }

    const fieldPath = expected_condition.fieldPath;
    const actualValue = fieldPath
      ? getFieldValue(targetEntity, fieldPath)
      : targetEntity;

    const valid = this.evaluateCondition(actualValue, expected_condition, targetEntity);

    let reason: string | undefined = undefined;
    if (!valid) {
      reason = `Dependency [${edge.id}] failed: expected ${expected_condition.operator} for field [${fieldPath || 'entity'}], got actual value [${JSON.stringify(actualValue)}]`;
    }

    return {
      dependencyId: edge.id,
      valid,
      actualValue,
      expectedCondition: expected_condition,
      reason,
    };
  }

  private static evaluateCondition(
    actualValue: unknown,
    condition: DependencyCondition,
    targetEntity: unknown
  ): boolean {
    const { operator, value } = condition;

    switch (operator) {
      case 'EXISTS':
        return targetEntity !== null && targetEntity !== undefined && actualValue !== undefined;
      case 'NOT_EXISTS':
        return targetEntity === null || targetEntity === undefined || actualValue === undefined;
      case 'EQUALS':
        return JSON.stringify(actualValue) === JSON.stringify(value);
      case 'NOT_EQUALS':
        return JSON.stringify(actualValue) !== JSON.stringify(value);
      case 'IN':
        if (!Array.isArray(value)) return false;
        return value.some((v) => JSON.stringify(v) === JSON.stringify(actualValue));
      case 'NOT_IN':
        if (!Array.isArray(value)) return true;
        return !value.some((v) => JSON.stringify(v) === JSON.stringify(actualValue));
      case 'GREATER_THAN':
        return typeof actualValue === 'number' && typeof value === 'number' && actualValue > value;
      case 'GREATER_THAN_OR_EQUAL':
        return typeof actualValue === 'number' && typeof value === 'number' && actualValue >= value;
      case 'LESS_THAN':
        return typeof actualValue === 'number' && typeof value === 'number' && actualValue < value;
      case 'LESS_THAN_OR_EQUAL':
        return typeof actualValue === 'number' && typeof value === 'number' && actualValue <= value;
      case 'CONTAINS':
        if (Array.isArray(actualValue)) {
          return actualValue.some((v) => JSON.stringify(v) === JSON.stringify(value));
        }
        if (typeof actualValue === 'string' && typeof value === 'string') {
          return actualValue.includes(value);
        }
        return false;
      default:
        return false;
    }
  }
}
