export class DeterministicIdFactory {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  private nextHash(input: string): string {
    let hash = 0x811c9dc5;
    const str = `${this.seed}:${input}`;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  public createId(prefix: string, indexKey: string | number): string {
    const hash = this.nextHash(String(indexKey));
    return `${prefix}-${hash.substring(0, 6)}`;
  }
}
