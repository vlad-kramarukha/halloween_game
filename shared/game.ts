import type { BoardEventState, EventAction } from './events.js';
export const gameConfig = {
  cellCount: 100,
  maxPlayers: 10,
  minPlayers: 2,
  rollDuration: 1600,
  stepDuration: 240,
  maxEventMoveDuration: 6000,
  reconnectGraceMs: 120_000,
} as const;

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
import type { CharacterId } from './characters.js';
export type { CharacterId } from './characters.js';
export { characterIds } from './characters.js';
export const playerColors = [
  'rgb(255, 174, 80)', 'rgb(115, 216, 210)', 'rgb(192, 139, 255)',
  'rgb(246, 126, 167)', 'rgb(166, 222, 111)', 'rgb(114, 166, 255)',
  'rgb(255, 226, 112)', 'rgb(232, 153, 117)', 'rgb(219, 168, 232)', 'rgb(204, 222, 231)',
] as const;

export interface PlayerEffects { nextRollModifier: number; nextRollTwice: boolean; skipTurns: number }
export interface PlayerState {
  effects?: PlayerEffects;
  id: string;
  nickname: string;
  character: CharacterId;
  slot: number;
  position: number;
  connected: boolean;
}
export interface RollState {
  id: number;
  playerId: string;
  value: DieValue;
  values?: DieValue[];
  modifier?: number;
  from: number;
  to: number;
  startedAt: number;
  moveAt: number;
  endsAt: number;
}
export interface PlayerMove { playerId: string; from: number; to: number; startedAt: number; endsAt: number }
export interface MovementState { id: number; endsAt: number; moves: PlayerMove[] }
export interface GameState {
  started: boolean;
  paused: boolean;
  collectedPickups?: number[];
  movement?: MovementState | null;
  roomId: string;
  revision: number;
  turnId: number;
  phase: 'waiting' | 'ready' | 'rolling' | 'event' | 'moving' | 'finished';
  players: PlayerState[];
  currentPlayerId: string | null;
  winnerId: string | null;
  winner?: PlayerState | null;
  roll: RollState | null;
  serverTime: number;
  event?: BoardEventState | null;
  notice?: string;
}
export interface JoinRequest { roomId: string; invitationToken?: string; nickname?: string; character?: CharacterId; token?: string }
export type JoinReply = { ok: true; playerId: string; token: string; state: GameState } | { ok: false; error: string };
export type ActionReply = { ok: true } | { ok: false; error: string };
export interface ClientEvents {
  'game:event': (request: EventAction, reply: (response: ActionReply) => void) => void;
  'game:leave': (reply: (response: ActionReply) => void) => void;
  'game:join': (request: JoinRequest, reply: (response: JoinReply) => void) => void;
  'game:roll': (request: { turnId: number }, reply: (response: ActionReply) => void) => void;
}
export interface ServerEvents {
  'game:kicked': (notice: { message: string }) => void; 'game:state': (state: GameState) => void }
