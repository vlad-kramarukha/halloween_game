import type { PlayerState, PlayerEffects } from '../../shared/game.js';
import type { EventCardId } from '../../shared/events.js';
type Target = 'self' | 'others' | 'ahead' | 'chosen';
export type EventCommand =
  | { type: 'move'; target: Target; steps: number | { die: true; factor: number; sum?: boolean } }
  | { type: 'modifier'; target: Target; amount: number }
  | { type: 'double-roll'; target: Target }
  | { type: 'skip'; target: Target; turns: number }
  | { type: 'leader' | 'nearest-behind'; target: Target };
export interface EventOutcome {
  message?: string;
  actions?: EventCommand[];
  roll?: { values: number[]; outcome: EventOutcome }[];
  confirm?: EventOutcome;
  selectPlayer?: { prompt: string; outcome: EventOutcome };
}
export interface EventDefinition {
  id: EventCardId;
  title: string;
  text: string;
  options?: { id: string; text: string; outcome: EventOutcome }[];
  outcome?: EventOutcome;
}
export interface EventParticipant { player: PlayerState; effects: PlayerEffects }