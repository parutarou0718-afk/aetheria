import type { ContextPacket } from './contextTypes';
export class ContextRenderer { static render(packet: ContextPacket): string { const { diagnostics: _diagnostics, ...data } = packet; return `CONTEXT_PACKET_JSON:\n${JSON.stringify(data)}\n\nCURRENT_INPUT:\n`; } }
