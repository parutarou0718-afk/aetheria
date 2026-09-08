import { WorldTransaction, ScheduledCheckpoint, LocationEdge } from '../../types';

/** Trusted runtime-only travel constraint. It is never LLM-controlled. */
export type TravelRouteConstraint = { kind: 'DIRECT_EDGE'; edgeId: string; originLocationId: string; destinationLocationId: string; };

export interface TravelPlanRequest {
  worldId: string;
  actorId: string;
  destinationLocationId: string;
  startEpoch: number;
  parentSeedId?: string;
  parentOrganizationId?: string;
  speedMultiplier?: number;
  routeConstraint?: TravelRouteConstraint;
}

export interface RoutePathResult {
  path: string[];
  edges: LocationEdge[];
  totalDistance: number;
  totalCost: number;
  totalEpochs: number;
}

export interface TravelPlanResult {
  transaction: WorldTransaction;
  checkpoints: ScheduledCheckpoint[];
  totalDistance: number;
  totalEpochs: number;
  route: string[];
}
