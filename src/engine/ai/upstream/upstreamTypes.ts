export interface UpstreamConfig { id: string; type: 'openai-compatible'; baseUrl: string; apiKey: string; enabled: boolean; priority: number; models: string[]; }
