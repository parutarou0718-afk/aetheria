import type { Character } from '../../types';
import type { CapabilitySnapshot } from './capabilityTypes';
export class CapabilitySnapshotService {
  static fromCharacter(character: Character): CapabilitySnapshot {
    const actionState = character.status === 'DEAD' ? 'DEAD' : character.status === 'INCAPACITATED' ? 'INCAPACITATED' : character.status === 'MISSING' || character.presence_state === 'MISSING' ? 'MISSING' : character.presence_state === 'IN_TRANSIT' ? 'IN_TRANSIT' : character.status === 'ALIVE' && character.presence_state === 'AT_LOCATION' && character.location_id ? 'AVAILABLE' : 'MISSING';
    return { characterId: character.id, actionState, locationId: character.location_id, attributes: { strength: character.attributes.strength, dexterity: character.attributes.dexterity, intelligence: character.attributes.intelligence, charisma: character.attributes.charisma }, skills: Object.entries(character.skills).filter(([, level]) => Number.isFinite(level)).map(([name, level]) => ({ name, level })).sort((a,b) => b.level - a.level || a.name.localeCompare(b.name)).slice(0, 20), resources: { hp: character.attributes.hp, mp: character.attributes.mp, gold: character.resources.gold }, usableItems: character.inventory.filter(item => item.quantity > 0).map(item => ({ itemId: item.item_id, name: item.name, type: item.type, quantity: item.quantity })).sort((a,b) => a.itemId.localeCompare(b.itemId)).slice(0, 20) };
  }
}
