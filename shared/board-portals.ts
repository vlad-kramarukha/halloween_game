import { createPickupLayout } from './pickup-layout.js';

export const portalPlacement = {
  count: 3, seed: 20261041, protectedStartCells: 3, protectedFinishCells: 3,
} as const;

/** Portals occupy the same reserved-free cells on the client and server. */
export function createBoardPortalLayout(cellCount: number, events: ReadonlySet<number>, pickups: ReadonlyMap<number, unknown>): Set<number> {
  return new Set(createPickupLayout(cellCount, new Set([...events, ...pickups.keys()]), {
    ...portalPlacement, countPerType: portalPlacement.count, types: [{ id: 'portal' }],
  }).keys());
}