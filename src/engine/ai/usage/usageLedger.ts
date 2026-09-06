import type { AiUsageRecord } from './usageTypes';
export interface UsageLedger { record(record: AiUsageRecord): Promise<void>; getByUser?(userId: string): Promise<AiUsageRecord[]>; }
export class InMemoryUsageLedger implements UsageLedger { private readonly records: AiUsageRecord[] = []; reset() { this.records.splice(0); } async record(record: AiUsageRecord) { this.records.push({ ...record }); } async getByUser(userId: string) { return this.records.filter((record) => record.userId === userId).map((record) => ({ ...record })); } }
