export type RuntimeHealthStatus = 'READY' | 'DEGRADED' | 'NOT_READY';

/** Safe operational state only; it never exposes world content or configuration. */
export class RuntimeHealthService {
  private databaseInitialized = false;
  private databaseIntegrity = false;
  private durabilityHealthy = false;
  private cacheSynchronized = true;
  private bootstrapHealthy = false;

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
