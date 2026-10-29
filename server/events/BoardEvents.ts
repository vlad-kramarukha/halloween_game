import type { EventPickupId } from '../../shared/events.js';
import { GameTimer } from '../GameClock.js';
import { randomInt } from 'node:crypto';
import { orangeEventCardIds, eventRules, type BoardEventState, type EventAction, type EventCardId } from '../../shared/events.js';
import type { DieValue } from '../../shared/game.js';
import { eventCatalog } from './catalog.js';
import { planEventActions, type EventResolution } from './execute.js';
import type { EventOutcome, EventParticipant } from './types.js';

interface Options {
  players: () => EventParticipant[];
  changed: () => void;
  done: (notice: string, resolution: EventResolution | null) => void;
  now: () => number;
  die: () => DieValue;
  rollDuration: number;
  responseTimeout?: number;
  pickCard?: () => EventCardId;
}

/** Drives any catalog entry using the same choose / confirm / roll / result state machine. */
export class BoardEvents {
  private state: BoardEventState | null = null;
  private pending: EventOutcome | null = null;
  private resolution: EventResolution | null = null;
  private sequence = 0;
  private readonly timer: GameTimer;
  private deck: EventCardId[] = [];
  private previous: EventCardId | null = null;
  constructor(private readonly options: Options) { this.timer = new GameTimer(options.now); }

  snapshot(): BoardEventState | null {
    return this.state ? { ...this.state, options: this.state.options.map(o => ({ ...o })), dice: [...this.state.dice] } : null;
  }
  private draw(): EventCardId {
    if (this.options.pickCard) return this.options.pickCard();
    if (!this.deck.length) {
      this.deck = [...orangeEventCardIds];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = randomInt(i + 1); [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      if (this.deck.at(-1) === this.previous) [this.deck[0], this.deck[this.deck.length - 1]] = [this.deck[this.deck.length - 1], this.deck[0]];
    }
    this.previous = this.deck.pop()!;
    return this.previous;
  }
  start(playerId: string, cardId?: EventCardId, pickupId?: EventPickupId): void {
    this.cancel();
    const card = eventCatalog[cardId ?? this.draw()];
    this.state = {
      id: ++this.sequence, cardId: card.id, source: cardId ? 'object' : 'orange', pickupId: pickupId ?? null, selectedPlayerId: null, title: card.title, text: card.text,
      options: card.options?.map(({ id, text }) => ({ id, text })) ?? [],
      playerId, startedAt: this.options.now(), stage: card.options?.length ? 'choice' : 'result',
      selectedOptionId: null, message: '', dice: [], rollEndsAt: null, deadline: 0,
    };
    if (card.outcome) this.applyOutcome(card.outcome);
    this.armResponse();
    this.options.changed();
  }
  act(playerId: string, request: EventAction): void {
    const state = this.state;
    if (!state || playerId !== state.playerId || request.eventId !== state.id) throw new Error('Эта карточка сейчас недоступна.');
    if (request.action === 'choose' && state.stage === 'choice') {
      const option = eventCatalog[state.cardId].options?.find(option => option.id === request.optionId);
      if (!option) throw new Error('Выберите один из предложенных ответов.');
      state.selectedOptionId = option.id;
      this.applyOutcome(option.outcome);
    } else if (request.action === 'target' && state.stage === 'target') {
      if (request.targetPlayerId === state.playerId) throw new Error('Нельзя наложить проклятие на себя. Выберите другого игрока.');
      if (!this.pending?.selectPlayer || !this.options.players().some(p => p.player.id === request.targetPlayerId)) throw new Error('Выбранный игрок больше не участвует в комнате.');
      state.selectedPlayerId = request.targetPlayerId!;
      this.applyOutcome(this.pending.selectPlayer.outcome);
    } else if (request.action === 'decline' && state.stage === 'confirm') {
      this.pending = null; state.stage = 'result';
      state.message = 'Ты отказался от дополнительного броска. Остаёшься на месте.';
    } else if (request.action === 'roll' && (state.stage === 'roll' || state.stage === 'confirm')) {
      if (state.stage === 'confirm') this.pending = this.pending?.confirm ?? null;
      if (!this.pending?.roll) throw new Error('Сейчас нельзя бросать кубик события.');
      this.clearTimer();
      state.dice.push(this.options.die()); state.stage = 'rolling';
      state.message = this.pending.message ?? 'Бросаем кубик…';
      state.rollEndsAt = this.options.now() + this.options.rollDuration;
      state.deadline = state.rollEndsAt + (this.options.responseTimeout ?? eventRules.responseTimeout);
      this.timer.set(() => this.revealRoll(), this.options.rollDuration);
      this.options.changed(); return;
    } else if (request.action === 'continue' && state.stage === 'result') {
      this.complete('', true); return;
    } else throw new Error('Действие уже выполнено или сейчас недоступно.');
    this.armResponse(); this.options.changed();
  }
  private revealRoll(): void {
    this.timer.clear();
    const state = this.state;
    if (!state || state.stage !== 'rolling') return;
    const value = state.dice.at(-1)!;
    const branch = this.pending?.roll?.find(branch => branch.values.includes(value));
    if (!branch) throw new Error('В конфиге события отсутствует исход броска ' + value);
    state.rollEndsAt = null;
    this.applyOutcome(branch.outcome, value);
    this.armResponse(); this.options.changed();
  }
  private applyOutcome(outcome: EventOutcome, value = this.state?.dice.at(-1) ?? 0): void {
    const state = this.state!;
    this.pending = outcome;
    state.message = outcome.message ?? '';
    if (outcome.selectPlayer) { state.stage = 'target'; state.message = outcome.selectPlayer.prompt; return; }
    if (outcome.confirm) { state.stage = 'confirm'; return; }
    if (outcome.roll) { state.stage = 'roll'; return; }
    this.resolution = planEventActions(outcome.actions ?? [], this.options.players(), state.playerId, value, { dice: state.dice, targetPlayerId: state.selectedPlayerId });
    const results = this.resolution.messages;
    state.message = [state.message, ...results].filter(Boolean).join('\n') || 'Остаёшься на месте.';
    state.stage = 'result'; this.pending = null;
  }
  ownerConnectionChanged(playerId: string): void {
    if (this.state?.playerId === playerId && this.state.stage === 'result') this.armResponse();
  }
  private armResponse(): void {
    this.clearTimer();
    if (!this.state) return;
    const owner = this.options.players().find(p => p.player.id === this.state!.playerId);
    if (this.state.stage === 'result' && owner?.player.connected !== false) {
      this.state.deadline = 0; return;
    }
    const duration = this.options.responseTimeout ?? eventRules.responseTimeout;
    this.state.deadline = this.options.now() + duration;
    this.timer.set(() => {
      const actor = this.options.players().find(p => p.player.id === this.state?.playerId)?.player.nickname ?? 'Игрок';
      this.complete(actor + ' не подтвердил событие вовремя. Событие пропущено.');
    }, duration);
  }
  private complete(notice: string, confirmed = false): void {
    const resolution = confirmed ? this.resolution : null;
    this.cancel(); this.options.done(notice, resolution);
  }
  pause(): void { this.timer.pause(); }
  resume(): void { this.timer.resume(); }
  private clearTimer(): void { this.timer.clear(); }
  cancel(): void { this.clearTimer(); this.state = null; this.pending = null; this.resolution = null; }
}