import type { QuestStatus } from './questTypes';

const transitions: Record<QuestStatus, readonly QuestStatus[]> = {
  AVAILABLE: ['ACTIVE', 'INVALIDATED'], ACTIVE: ['COMPLETED', 'FAILED', 'INVALIDATED'],
  COMPLETED: [], FAILED: [], INVALIDATED: [],
};
export class QuestStateMachine { static canTransition(from: QuestStatus, to: QuestStatus): boolean { return transitions[from].includes(to); } }
