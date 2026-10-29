import type { EventPickupId } from '../../shared/events';
import { eventPresentation } from '../config/event-presentation';
import { DiceView } from './DiceView';
import { diceConfig } from '../config/dice';
import type { DieValue } from '../../shared/game';
import type { GameState } from '../../shared/game';
import type { EventAction } from '../../shared/events';
import './EventPanel.css';

/** Shared event card. Observers see the same text; only the owner can act. */
export class EventPanel {
  private readonly element = document.createElement('section');
  private readonly die = new DiceView();
  private diceSignature = '';
  private state: GameState | null = null;
  private selfId = '';
  private connected = false;
  private busy = false;
  private signature = '';
  private error = '';
  private previousFocus: HTMLElement | null = null;
  private destroyed = false;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(parent: HTMLElement, private readonly act: (request: EventAction) => Promise<void>, private readonly pickupImage: (id: EventPickupId) => string | undefined) {
    this.element.className = 'event-panel'; this.element.hidden = true;
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'board-event-title');
    this.element.addEventListener('keydown', this.onKey);
    parent.append(this.element);
  }
  setState(state: GameState, selfId: string, connected: boolean): void {
    if (!connected) { this.die.setPaused(true); this.diceSignature = ''; }
    this.state = state; this.selfId = selfId; this.connected = connected;
    const event = state.phase === 'event' ? state.event : null;
    if (!event) { this.clear(); return; }
    const delay = Math.max(0, event.startedAt + (event.source === 'orange' ? eventPresentation.cardDelay : eventPresentation.objectCardDelay) - state.serverTime);
    if (this.element.hidden && delay > 0) {
      if (!this.revealTimer) this.revealTimer = setTimeout(() => { this.revealTimer = null; this.present(); }, delay);
      return;
    }
    this.present();
  }
  private present(): void {
    const state = this.state;
    const event = state?.phase === 'event' ? state.event : null;
    if (!event || !state || this.destroyed) return;
    const actor = state.players.find(p => p.id === event.playerId);
    const signature = JSON.stringify([state.paused, event, this.selfId, this.connected, actor?.connected, actor?.nickname, event.stage === 'target' ? state.players.map(p => [p.id, p.nickname, p.connected]) : null]);
    if (signature === this.signature) return;
    const opening = this.element.hidden;
    if (opening) this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.signature = signature; this.busy = false; this.error = '';
    this.element.hidden = false; this.render(); this.syncDice();
    if (opening) {
      this.element.querySelector('h2')?.focus({ preventScroll: true });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.element.querySelector('.event-panel__card')?.animate([
          { opacity: 0, transform: 'translateY(22px) scale(.94)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
  }
  private render(): void {
    const keepFocus = this.element.contains(document.activeElement);
    const scrollTop = this.element.querySelector('.event-panel__card')?.scrollTop ?? 0;
    const event = this.state?.event;
    if (!event || !this.state) return;
    const actor = this.state.players.find(p => p.id === event.playerId);
    const mine = event.playerId === this.selfId;
    const enabled = mine && this.connected && !this.busy && !this.state.paused;
    const card = document.createElement('div'); card.className = 'event-panel__card';
    const eyebrow = document.createElement('p'); eyebrow.className = 'event-panel__eyebrow';
    eyebrow.textContent = (event.source === 'orange' ? 'Оранжевая клетка · ' : 'Находка на клетке · ') + (actor?.nickname ?? 'Игрок');
    const title = document.createElement('h2'); title.id = 'board-event-title'; title.textContent = event.title; title.tabIndex = -1;
    const text = document.createElement('p'); text.className = 'event-panel__text'; text.textContent = event.text;
    card.append(eyebrow);
    if (event.source === 'object' && event.pickupId) {
      const src = this.pickupImage(event.pickupId);
      if (src) {
        const image = document.createElement('img');
        image.className = 'event-panel__pickup';
        image.src = src;
        image.alt = event.pickupId === 'portal' ? 'Портал' : 'Подобранный предмет';
        image.width = 112; image.height = 112;
        image.draggable = false;
        card.append(image);
      }
    }
    card.append(title, text);
    if (event.selectedOptionId) {
      const selected = document.createElement('p'); selected.className = 'event-panel__selected';
      selected.textContent = 'Выбран ответ: ' + (event.options.find(o => o.id === event.selectedOptionId)?.text ?? '');
      card.append(selected);
    }
    const buttons = document.createElement('div'); buttons.className = 'event-panel__actions';
    const button = (label: string, action: EventAction['action'], optionId?: string, targetPlayerId?: string) => {
      const control = document.createElement('button'); control.type = 'button'; control.textContent = label;
      control.dataset.action = action;
      control.disabled = !enabled; control.onclick = () => void this.submit({ eventId: event.id, action, optionId, targetPlayerId });
      buttons.append(control);
    };
    if (event.stage === 'choice') for (const option of event.options) button(option.text, 'choose', option.id);
    if (event.stage === 'target') for (const player of this.state.players.filter(player => player.id !== event.playerId)) {
      button(player.nickname + (player.id === this.selfId ? ' (ты)' : '') + ' · клетка ' + (player.position + 1) + (player.connected ? '' : ' · нет связи'), 'target', undefined, player.id);
    }
    if (event.stage === 'confirm') { button('Да, бросить', 'roll'); button('Нет, остаться', 'decline'); }
    if (event.stage === 'roll') button('Бросить кубик', 'roll');
    const shownDice = event.stage === 'rolling' ? event.dice.slice(0, -1) : event.dice;
    if (event.stage === 'roll' || event.stage === 'rolling' || event.stage === 'confirm' || event.dice.length) {
      const dice = document.createElement('div'); dice.className = 'event-panel__die';
      dice.style.setProperty('--dice-size', diceConfig.size + 'px');
      dice.setAttribute('aria-label', event.stage === 'rolling' ? 'Кубик бросается' : 'Кубик события');
      dice.append(this.die.element);
      if (shownDice.length) {
        const history = document.createElement('div'); history.className = 'event-panel__history';
        shownDice.forEach((value, index) => {
          const result = document.createElement('span'); result.textContent = 'Бросок ' + (index + 1) + ': ' + value; history.append(result);
        });
        dice.append(history);
      }
      card.append(dice);
    }
    if (event.message) {
      const outcome = document.createElement('p'); outcome.className = 'event-panel__outcome';
      outcome.setAttribute('role', 'status'); outcome.textContent = event.message; card.append(outcome);
    }
    if (event.stage === 'result') button('Продолжить', 'continue');
    const status = document.createElement('p'); status.className = 'event-panel__status'; status.setAttribute('role', 'status');
    status.textContent = this.error || (this.state.paused ? 'Игра на паузе' : !this.connected ? 'Связь потеряна. Переподключаемся…' : this.busy ? 'Применяем действие…'
      : event.stage === 'rolling' ? 'Все игроки ждут результата броска…'
      : mine ? '' : 'Ожидаем решение: ' + (actor?.nickname ?? 'игрок') + (actor?.connected === false ? ' · нет связи' : ''));
    status.hidden = !status.textContent;
    card.append(buttons, status);
    this.element.replaceChildren(card);
    card.scrollTop = scrollTop;
    if (keepFocus) (this.element.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? title).focus({ preventScroll: true });
  }
  private syncDice(): void {
    const event = this.state?.event;
    if (!event || !this.connected) return;
    const signature = event.id + ':' + event.stage + ':' + event.dice.join(',');
    this.die.setPaused(!!this.state?.paused);
    if (signature === this.diceSignature) return;
    this.diceSignature = signature;
    const value = (event.dice.at(-1) ?? 1) as DieValue;
    if (event.stage === 'rolling') {
      void this.die.roll(value, Math.max(0, (event.rollEndsAt ?? this.state!.serverTime) - this.state!.serverTime));
    } else this.die.setResult(value);
    this.die.setPaused(!!this.state?.paused);
  }
  private async submit(request: EventAction): Promise<void> {
    if (this.busy || this.state?.paused || !this.connected || this.state?.event?.playerId !== this.selfId) return;
    this.busy = true; this.error = ''; this.render();
    try { await this.act(request); }
    catch (error) { if (this.state?.event?.id === request.eventId) this.error = error instanceof Error ? error.message : 'Действие не выполнено.'; }
    finally { if (!this.destroyed && this.state?.event?.id === request.eventId) { this.busy = false; this.render(); } }
  }
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const controls = [...this.element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!controls.length) { event.preventDefault(); this.element.querySelector('h2')?.focus(); return; }
    const index = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus();
    }
  };
  clear(): void {
    if (this.revealTimer) clearTimeout(this.revealTimer); this.revealTimer = null;
    const visible = !this.element.hidden;
    this.die.clear(); this.diceSignature = '';
    this.element.hidden = true; this.state = null; this.signature = ''; this.error = ''; this.busy = false;
    if (visible && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
  destroy(): void { this.destroyed = true; this.clear(); this.die.destroy(); this.element.removeEventListener('keydown', this.onKey); this.element.remove(); }
}