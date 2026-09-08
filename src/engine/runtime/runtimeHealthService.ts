export type RuntimeHealthStatus = 'READY' | 'DEGRADED' | 'NOT_READY';

/** Safe operational state only; it never exposes world content or configuration. */
export class RuntimeHealthService {
  // A process only starts serving after createApp initialized persistence. The
  // optimistic default keeps pure application-route tests independent of a
  // process bootstrap, while explicit fault paths always fail closed.
  private databaseInitialized = true;
  private databaseIntegrity = true;
  private durabilityHealthy = true;
  private cacheSynchronized = true;
  private bootstrapHealthy = true;

  markDatabaseHealthy(): void { this.databaseInitialized = true; this.databaseIntegrity = true; this.durabilityHealthy = true; }
  markBootstrapHealthy(): void { this.bootstrapHealthy = true; }
  markCacheUnsynchronized(): void { this.cacheSynchronized = false; }
  markCacheSynchronized(): void { this.cacheSynchronized = true; }
  markNotReady(): void { this.bootstrapHealthy = false; }
  get status(): RuntimeHealthStatus { return this.databaseInitialized && this.databaseIntegrity && this.durabilityHealthy && this.cacheSynchronized && this.bootstrapHealthy ? 'READY' : this.databaseInitialized ? 'DEGRADED' : 'NOT_READY'; }
  isReady(): boolean { return this.status === 'READY'; }
  publicView(): { status: RuntimeHealthStatus } { return { status: this.status }; }
}

export const runtimeHealth = new RuntimeHealthService();
