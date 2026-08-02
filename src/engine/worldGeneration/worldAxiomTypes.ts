export type WorldAxiomCategory =
  | 'COSMOLOGY'
  | 'POWER'
  | 'DEATH'
  | 'TIME'
  | 'GEOGRAPHY'
  | 'SOCIETY'
  | 'ECONOMY'
  | 'BIOLOGY'
  | 'TECHNOLOGY';

export interface WorldAxiom {
  id: string;
  world_id: string;

  category: WorldAxiomCategory;
  statement: string;
  consequences: string[];

  immutable: true;
  created_at_epoch: number;
}
