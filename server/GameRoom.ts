import { createBoardPortalLayout } from '../shared/board-portals.js';
import { GameClock, GameTimer } from './GameClock.js';
import { createBoardPickupLayout, objectKind, type PickupId } from '../shared/board-pickups.js';
import { BoardEvents } from './events/BoardEvents.js';
import type { EventResolution } from './events/execute.js';
import type { MovementState } from '../shared/game.js';
import { emptyEffects } from './events/execute.js';
import { eventsConfig } from '../shared/board-events.js';
import { createEventLayout } from '../shared/event-layout.js';
import { objectEventCards, type EventAction, type EventCardId } from '../shared/events.js';
import type { PlayerEffects } from '../shared/game.js';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { characterIds, gameConfig, type DieValue, type GameState, type JoinRequest, type PlayerState, type RollState } from '../shared/game.js';

interface Member { effects: PlayerEffects; identity: string; player: PlayerState; token: string; socketId: string | null; disconnectedAt: number | null }
export interface GameRoomOptions { portalCells?: readonly number[]; objectCells?: ReadonlyMap<number, PickupId>; eventCells?: readonly number[]; pickCard?: () => EventCardId; eventTimeout?: number; invitationToken?: string; now?: () => number; die?: () => DieValue; rollDuration?: number; stepDuration?: number }

/** All mutations run on the server. Clients can only request a turn, never a value or position. */
export class GameRoom {
  readonly invitationToken: string | null;
  private members: Member[] = [];
  private revision = 0;
  private started = false;
  private turnId = 0;
  private currentId: string | null = null;
  private winnerId: string | null = null;
  private winner: PlayerState | null = null;
  private roll: RollState | null = null;
  private movement: MovementState | null = null;
  private movementSequence = 0;
  private phase: GameState['phase'] = 'waiting';
  private readonly timer: GameTimer;
  private readonly clock: GameClock;
  private readonly now: () => number;
  private readonly die: () => DieValue;
  private readonly rollDuration: number;
  private readonly stepDuration: number;
  private readonly boardEvents: BoardEvents;
  private readonly eventCells: Set<number>;
  private readonly objectCells: Map<number, PickupId>;
  // Hidden only while the player who picked the object still occupies its cell.
  private readonly collectedPickups = new Map<number, string>();
  private readonly portalCells: Set<number>;
  private landings: { playerId: string; cell: number }[] = [];
  private readonly visitedEffects = new Set<string>();
  private effectActorId: string | null = null;
  private notice = '';

  constructor(readonly id: string, private readonly publish: (state: GameState) => void, options: GameRoomOptions = {}) {
    this.invitationToken = options.invitationToken ?? null;
    this.clock = new GameClock(options.now ?? Date.now);
    this.now = this.clock.now;
    this.timer = new GameTimer(this.now);
    this.die = options.die ?? (() => randomInt(1, 7) as DieValue);
    this.rollDuration = options.rollDuration ?? gameConfig.rollDuration;
    this.stepDuration = options.stepDuration ?? gameConfig.stepDuration;
    this.eventCells = new Set(options.eventCells ?? createEventLayout(gameConfig.cellCount, eventsConfig).keys());
    this.objectCells = new Map(options.objectCells ?? createBoardPickupLayout(gameConfig.cellCount, this.eventCells));
    this.portalCells = new Set(options.portalCells ?? createBoardPortalLayout(gameConfig.cellCount, this.eventCells, this.objectCells));
    this.boardEvents = new BoardEvents({
      players: () => this.members,
      changed: () => { this.refreshWinner(); this.changed(); },
      done: (notice, resolution) => this.applyEventResolution(notice, resolution),
      now: this.now, die: this.die, rollDuration: this.rollDuration,
      responseTimeout: options.eventTimeout, pickCard: options.pickCard,
    });
  }

  acceptsInvitation(token: unknown): boolean {
    if (!this.invitationToken) return true;
    return typeof token === 'string' && Buffer.byteLength(token) === Buffer.byteLength(this.invitationToken)
      && timingSafeEqual(Buffer.from(token), Buffer.from(this.invitationToken));
  }

  identityForToken(token: string): string | null {
    return this.members.find(member => member.token === token)?.identity ?? null;
  }

  findIdentity(identity: string): { connected: boolean; token: string } | null {
    const member = this.members.find(member => member.identity === identity);
    return member ? { connected: member.player.connected, token: member.token } : null;
  }

  snapshot(): GameState {
    return {
      roomId: this.id, started: this.started, paused: this.clock.paused, collectedPickups: [...this.collectedPickups.keys()], revision: this.revision, turnId: this.turnId, phase: this.phase,
      players: this.members.map(({ player, effects }) => ({ ...player, effects: { ...effects } })), currentPlayerId: this.currentId,
      winnerId: this.winnerId, winner: this.winner ? { ...this.winner } : null, roll: this.roll ? { ...this.roll } : null, serverTime: this.now(), event: this.boardEvents.snapshot(), notice: this.notice, movement: this.movement ? { ...this.movement, moves: this.movement.moves.map(move => ({ ...move })) } : null,
    };
  }

  join(socketId: string, request: JoinRequest, identity = socketId): { playerId: string; token: string } {
    const existing = request.token && this.members.find(member => member.token === request.token);
    if (existing) {
      if (existing.identity !== identity) throw new Error('Эта сессия принадлежит другому игроку.');
      if (existing.socketId && existing.socketId !== socketId) throw new Error('Этот игрок уже подключён в другой вкладке.');
      existing.socketId = socketId;
      existing.disconnectedAt = null;
      existing.player.connected = true;
      this.boardEvents.ownerConnectionChanged(existing.player.id);
      this.reconcile();
      this.changed();
      return { playerId: existing.player.id, token: existing.token };
    }
    if (request.token) throw new Error('Сессия истекла. Войдите заново.');
    if (this.phase === 'finished') throw new Error('Игра завершена. Откройте ссылку с новым именем комнаты.');
    if (this.members.length >= gameConfig.maxPlayers) throw new Error('В комнате уже 10 игроков.');
    if (!characterIds.includes(request.character!)) throw new Error('Выберите персонажа.');
    const slot = Array.from({ length: gameConfig.maxPlayers }, (_, i) => i)
      .find(index => !this.members.some(member => member.player.slot === index))!;
    const nickname = typeof request.nickname === 'string' ? request.nickname.trim().slice(0, 20) : '';
    const member: Member = {
      effects: emptyEffects(), identity, token: randomUUID(), socketId, disconnectedAt: null,
      player: { id: randomUUID(), nickname: nickname || `Игрок ${slot + 1}`, character: request.character!, slot, position: 0, connected: true },
    };
    this.members.push(member);
    this.reconcile();
    this.changed();
    return { playerId: member.player.id, token: member.token };
  }

  /** Only the authenticated admin HTTP action invokes this method. */
  start(): void {
    if (this.started) throw new Error('Сессия уже запущена.');
    if (this.members.filter(member => member.player.connected).length < gameConfig.minPlayers) {
      throw new Error('Для запуска нужны хотя бы два игрока онлайн.');
    }
    this.started = true;
    this.notice = '';
    this.currentId = null;
    this.reconcile();
    this.changed();
  }

  pause(): void {
    if (!this.started || this.phase === 'finished') throw new Error('Сначала запустите незавершённую игру.');
    if (this.clock.paused) throw new Error('Игра уже на паузе.');
    this.clock.pause();
    this.timer.pause();
    this.boardEvents.pause();
    this.changed();
  }

  resume(): void {
    if (!this.clock.paused) throw new Error('Игра не находится на паузе.');
    this.clock.resume();
    this.timer.resume();
    this.boardEvents.resume();
    this.reconcile();
    this.changed();
  }

  requestRoll(socketId: string, turnId: number): void {
    if (!this.started) throw new Error('Ожидаем запуска игры администратором.');
    if (this.clock.paused) throw new Error('Игра на паузе. Дождитесь продолжения.');
    const member = this.members.find(member => member.socketId === socketId);
    if (!member || this.phase !== 'ready' || member.player.id !== this.currentId || turnId !== this.turnId) {
      throw new Error('Сейчас нельзя бросать кубик. Дождитесь своего хода.');
    }
    this.landings = []; this.visitedEffects.clear(); this.effectActorId = null;
    const values = [this.die()];
    if (member.effects.nextRollTwice) values.push(this.die());
    const value = values.at(-1)!;
    const modifier = member.effects.nextRollModifier;
    member.effects.nextRollModifier = 0; member.effects.nextRollTwice = false;
    const from = member.player.position;
    const to = Math.max(0, Math.min(gameConfig.cellCount - 1, from + values.reduce((sum, die) => sum + die, 0) + modifier));
    this.notice = '';
    const startedAt = this.now();
    this.phase = 'rolling';
    this.roll = { id: this.turnId, playerId: member.player.id, value, values, modifier, from, to, startedAt,
      moveAt: startedAt + this.rollDuration * values.length, endsAt: startedAt + this.rollDuration * values.length + Math.abs(to - from) * this.stepDuration };
    this.timer.set(() => this.finishRoll(), this.roll.endsAt - startedAt);
    this.changed();
  }

  private finishRoll(): void {
    this.timer.clear();
    if (this.phase !== 'rolling' || !this.roll) return;
    const member = this.members.find(member => member.player.id === this.roll!.playerId);
    if (member) {
      member.player.position = this.roll.to;
      if (member.player.position === gameConfig.cellCount - 1) this.winnerId = member.player.id;
    }
    if (member) this.landings.push({ playerId: member.player.id, cell: member.player.position });
    this.resolveLandings();
  }

  /** Drain confirmed arrivals in order, keeping the original player's turn until the chain finishes. */
  private resolveLandings(notice = ''): void {
    this.restoreVacatedPickups();
    this.refreshWinner();
    if (this.winnerId) { this.finishTurn(notice); return; }
    while (this.landings.length) {
      const landing = this.landings.shift()!;
      const member = this.members.find(member => member.player.id === landing.playerId);
      if (!member || member.player.position !== landing.cell) continue;
      const key = member.player.id + ':' + landing.cell;
      if (this.visitedEffects.has(key)) continue;
      const object = this.objectCells.get(landing.cell);
      const orange = this.eventCells.has(landing.cell);
      const portal = this.portalCells.has(landing.cell);
      if (!orange && !portal && (!object || this.collectedPickups.has(landing.cell))) continue;
      this.visitedEffects.add(key);
      this.effectActorId = member.player.id;
      this.phase = 'event';
      if (orange) this.boardEvents.start(member.player.id);
      else if (portal) this.boardEvents.start(member.player.id, objectEventCards.portal, 'portal');
      else if (object) {
        this.collectedPickups.set(landing.cell, member.player.id);
        this.boardEvents.start(member.player.id, objectEventCards[objectKind(object)], object);
      }
      return;
    }
    this.finishTurn(notice);
  }

  private applyEventResolution(notice: string, resolution: EventResolution | null): void {
    const startedAt = this.now();
    const moves: MovementState['moves'] = [];
    for (const update of resolution?.updates ?? []) {
      const member = this.members.find(member => member.player.id === update.playerId);
      if (!member) continue;
      member.effects = { ...update.effects };
      if (member.player.position !== update.position) {
        moves.push({ playerId: member.player.id, from: member.player.position, to: update.position, startedAt,
          endsAt: startedAt + Math.min(gameConfig.maxEventMoveDuration, Math.abs(update.position - member.player.position) * this.stepDuration) });
      }
    }
    if (!moves.length) { this.resolveLandings(notice); return; }
    this.roll = null;
    moves.sort((a, b) => Number(b.playerId === this.effectActorId) - Number(a.playerId === this.effectActorId));
    const firstFinisher = moves.filter(move => move.to === gameConfig.cellCount - 1).sort((a, b) => a.endsAt - b.endsAt)[0];
    this.movement = { id: ++this.movementSequence, endsAt: firstFinisher?.endsAt ?? Math.max(...moves.map(move => move.endsAt)), moves };
    this.phase = 'moving'; this.notice = notice;
    const finish = () => {
      this.timer.clear();
      if (!this.movement || this.phase !== 'moving') return;
      const activeMoves = this.movement.moves.filter(move => this.members.some(member => member.player.id === move.playerId));
      const now = this.now();
      const finishers = activeMoves.filter(move => move.to === gameConfig.cellCount - 1).sort((a, b) => a.endsAt - b.endsAt);
      const winningMove = finishers.find(move => move.endsAt <= now);
      const nextEnd = finishers[0]?.endsAt ?? Math.max(now, ...activeMoves.map(move => move.endsAt));
      if (!winningMove && nextEnd > now) {
        this.movement.endsAt = nextEnd;
        this.timer.set(finish, nextEnd - now);
        this.changed();
        return;
      }
      for (const move of activeMoves) {
        const member = this.members.find(member => member.player.id === move.playerId)!;
        if (winningMove) {
          const fraction = Math.min(1, (now - move.startedAt) / Math.max(1, move.endsAt - move.startedAt));
          const position = move.from + (move.to - move.from) * fraction;
          member.player.position = move.playerId === winningMove.playerId ? gameConfig.cellCount - 1
            : Math.min(gameConfig.cellCount - 2, move.to >= move.from ? Math.floor(position) : Math.ceil(position));
        } else member.player.position = move.to;
        this.landings.push({ playerId: member.player.id, cell: member.player.position });
      }
      if (winningMove) this.winnerId = winningMove.playerId;
      this.movement = null; this.resolveLandings(notice);
    };
    if (this.movement.endsAt <= startedAt) { finish(); return; }
    this.timer.set(finish, this.movement.endsAt - startedAt);
    this.changed();
  }

  private refreshWinner(): void {
    if (!this.started) { this.winnerId = null; this.winner = null; return; }
    if (!this.winnerId) this.winnerId = this.members.find(member => member.player.position === gameConfig.cellCount - 1)?.player.id ?? null;
    if (this.winnerId && !this.winner) {
      const player = this.members.find(member => member.player.id === this.winnerId)?.player;
      if (player) this.winner = { ...player };
    }
  }
  private finishTurn(notice = ''): void {
    this.landings = []; this.visitedEffects.clear(); this.effectActorId = null;
    this.notice = notice;
    this.refreshWinner();
    if (this.winnerId) {
      this.phase = 'finished'; this.currentId = null; this.movement = null;
      this.timer.clear(); this.boardEvents.cancel();
    }
    else {
      this.phase = 'waiting'; this.advanceTurn(); this.reconcile();
    }
    this.changed();
  }
  requestEvent(socketId: string, request: EventAction): void {
    if (this.clock.paused) throw new Error('Игра на паузе. Дождитесь продолжения.');
    const member = this.members.find(member => member.socketId === socketId);
    if (!member || this.phase !== 'event') throw new Error('Сейчас нет доступного события.');
    this.boardEvents.act(member.player.id, request);
  }

  leave(socketId: string): void {
    const member = this.members.find(member => member.socketId === socketId);
    if (member) this.kickPlayer(member.player.id);
  }

  disconnect(socketId: string): void {
    const member = this.members.find(member => member.socketId === socketId);
    if (!member) return;
    member.socketId = null;
    member.disconnectedAt = this.now();
    member.player.connected = false;
    this.boardEvents.ownerConnectionChanged(member.player.id);
    // A running roll completes even if its owner disconnects.
    this.reconcile();
    this.changed();
  }

  prune(): boolean {
    const previous = this.members.length;
    this.members = this.members.filter(member => member.disconnectedAt === null
      || this.now() - member.disconnectedAt < gameConfig.reconnectGraceMs
      || ((this.phase === 'rolling' || this.phase === 'event' || this.phase === 'moving') && (member.player.id === this.currentId || member.player.id === this.boardEvents.snapshot()?.playerId)));
    if (previous !== this.members.length) { this.reconcile(); this.changed(); }
    return this.members.length === 0 && !this.invitationToken;
  }

  /** Admin changes invalidate pending turns and cancel their timers. */
  private cancelRoll(): void {
    this.landings = []; this.visitedEffects.clear(); this.effectActorId = null;
    this.movement = null;
    this.boardEvents.cancel();
    this.timer.clear();
    this.roll = null;
    this.turnId++;
  }

  private reconcileAdmin(): void {
    this.winner = null;
    this.winnerId = this.started ? this.members.find(member => member.player.position === gameConfig.cellCount - 1)?.player.id ?? null : null;
    this.refreshWinner();
    if (this.winnerId) this.currentId = null;
    this.phase = this.winnerId ? 'finished' : 'waiting';
    this.reconcile();
  }

  reset(): void {
    this.started = false;
    this.clock.resume();
    this.timer.clear(); this.timer.resume();
    this.boardEvents.cancel(); this.boardEvents.resume();
    this.collectedPickups.clear();
    this.cancelRoll();
    this.notice = '';
    for (const member of this.members) { member.player.position = 0; member.effects = emptyEffects(); }
    this.currentId = this.members.find(member => member.player.connected)?.player.id ?? null;
    this.reconcileAdmin();
    this.changed();
  }

  movePlayer(playerId: string, cell: number): void {
    const member = this.members.find(member => member.player.id === playerId);
    if (!member) throw new Error('Игрок не найден.');
    if (!Number.isSafeInteger(cell) || cell < 1 || cell > gameConfig.cellCount) {
      throw new Error(`Укажите клетку от 1 до ${gameConfig.cellCount}.`);
    }
    this.cancelRoll();
    member.player.position = cell - 1;
    this.reconcileAdmin();
    this.changed();
  }

  kickPlayer(playerId: string): string | null {
    const member = this.members.find(member => member.player.id === playerId);
    if (!member) throw new Error('Игрок не найден.');
    member.player.connected = false;
    const secondaryEventOwner = this.phase === 'event' && this.boardEvents.snapshot()?.playerId === playerId && this.currentId !== playerId;
    if ((this.phase === 'rolling' && this.roll?.playerId === playerId)
      || (this.phase === 'event' && (this.boardEvents.snapshot()?.playerId === playerId || this.currentId === playerId))
      || (this.phase === 'moving' && this.currentId === playerId)) {
      this.cancelRoll();
      this.phase = 'waiting';
    }
    if (this.currentId === playerId || secondaryEventOwner) this.advanceTurn();
    else this.turnId++;
    this.members = this.members.filter(other => other !== member);
    if (this.phase !== 'rolling' && this.phase !== 'event' && this.phase !== 'moving' && this.phase !== 'finished') this.reconcileAdmin();
    this.changed();
    return member.socketId;
  }
  private advanceTurn(includeCurrent = false): void {
    if (!this.started) { this.currentId = null; return; }
    const index = this.members.findIndex(member => member.player.id === this.currentId) - (includeCurrent ? 1 : 0);
    this.currentId = null;
    const maxSkips = Math.max(0, ...this.members.map(member => member.effects.skipTurns));
    const skipped: string[] = [];
    const canSkip = !this.clock.paused && this.members.filter(member => member.player.connected).length >= gameConfig.minPlayers;
    for (let offset = 1; offset <= this.members.length * (maxSkips + 1); offset++) {
      const member = this.members[(index + offset) % this.members.length];
      if (!member.player.connected) continue;
      if (canSkip && member.effects.skipTurns > 0) {
        member.effects.skipTurns--; skipped.push(member.player.nickname); continue;
      }
      this.currentId = member.player.id; break;
    }
    if (skipped.length) this.notice = skipped.join(', ') + ': пропуск хода.';
    this.turnId++;
  }

  private reconcile(): void {
    if (!this.started) { this.currentId = null; this.phase = 'waiting'; return; }
    if (this.clock.paused) return;
    if (this.phase === 'rolling' || this.phase === 'event' || this.phase === 'moving' || this.phase === 'finished') return;
    const currentConnected = this.members.some(member => member.player.id === this.currentId && member.player.connected);
    if (!currentConnected) this.advanceTurn();
    const enoughPlayers = this.members.filter(member => member.player.connected).length >= gameConfig.minPlayers;
    if (enoughPlayers && this.members.find(member => member.player.id === this.currentId)?.effects.skipTurns) this.advanceTurn(true);
    this.phase = enoughPlayers ? 'ready' : 'waiting';
  }

  private restoreVacatedPickups(): void {
    for (const [cell, collectorId] of this.collectedPickups) {
      if (!this.members.some(member => member.player.id === collectorId && member.player.position === cell)) {
        this.collectedPickups.delete(cell);
      }
    }
  }

  private changed(): void { this.restoreVacatedPickups(); this.revision++; this.publish(this.snapshot()); }
  destroy(): void { this.boardEvents.cancel(); this.timer.clear(); }
}

