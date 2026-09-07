import { describe, expect, it } from 'vitest';
import { QuestStateMachine } from '../src/engine/quest/questStateMachine';

describe('QuestStateMachine', () => {
  it.each([
    ['AVAILABLE', 'ACTIVE', true], ['ACTIVE', 'COMPLETED', true], ['ACTIVE', 'FAILED', true],
    ['ACTIVE', 'INVALIDATED', true], ['AVAILABLE', 'INVALIDATED', true], ['COMPLETED', 'ACTIVE', false],
    ['FAILED', 'COMPLETED', false], ['INVALIDATED', 'COMPLETED', false],
  ] as const)('allows only supported transition %s -> %s', (from, to, valid) => {
    expect(QuestStateMachine.canTransition(from, to)).toBe(valid);
  });
});
