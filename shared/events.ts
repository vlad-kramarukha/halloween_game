import type { PickupId } from './board-pickups.js';
export const orangeEventCardIds = ['interview', 'documents', 'conflict', 'security', 'reviews', 'bank', 'messenger', 'directions', 'best-self', 'resume-ai'] as const;
export const objectEventCards = {
  ghost: 'object-ghost', coin: 'object-coin', pumpkin: 'object-pumpkin',
  candy: 'object-candy', broom: 'object-broom', potion: 'object-potion', portal: 'object-portal',
} as const;
export const eventCardIds = [...orangeEventCardIds, ...Object.values(objectEventCards)] as const;
export type EventPickupId = PickupId | 'portal';
export type EventCardId = typeof eventCardIds[number];
export type EventStage = 'choice' | 'target' | 'confirm' | 'roll' | 'rolling' | 'result';
export interface BoardEventState {
  id: number;
  cardId: EventCardId;
  source: 'orange' | 'object';
  pickupId: EventPickupId | null;
  selectedPlayerId: string | null;
  title: string;
  text: string;
  options: { id: string; text: string }[];
  playerId: string;
  startedAt: number;
  stage: EventStage;
  selectedOptionId: string | null;
  message: string;
  dice: number[];
  rollEndsAt: number | null;
  deadline: number;
}
export interface EventAction {
  eventId: number;
  action: 'choose' | 'target' | 'roll' | 'decline' | 'continue';
  optionId?: string;
  targetPlayerId?: string;
}
export const eventRules = { responseTimeout: 60_000 } as const;