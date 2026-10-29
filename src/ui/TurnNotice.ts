import type { GameState } from '../../shared/game';
import { yourTurnKey } from '../game/session-controls';
import { turnNoticeConfig as config } from '../config/turn-notice';
import './TurnNotice.css';

/** Shared lifecycle and personal-turn announcements, without intercepting input. */
export class TurnNotice {
  private readonly element = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly hint = document.createElement('p');
  private lastKey: string | null = null;
  private state: GameState | null = null;
  private selfId = '';
  private kind = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    this.element.className = 'turn-notice';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');
    const content = document.createElement('div');
    content.append(this.title, this.hint);
    this.element.append(content);
    this.element.hidden = true;
    parent.append(this.element);
  }

  setState(state: GameState | null, selfId: string, connected: boolean): void {
    if (!state || !connected || state.phase === 'finished') { this.clear(); return; }
    const previous = this.state;
    this.state = state; this.selfId = selfId;
    if (!state.started) {
      this.lastKey = null;
      this.show('waiting', config.waiting, config.waitingHint);
      return;
    }
    if (state.paused) {
      this.lastKey = null;
      this.show('paused', config.paused, config.pausedHint);
      return;
    }
    if (previous?.roomId === state.roomId && (!previous.started || previous.paused)) {
      this.flash('session', previous.started ? config.resumed : config.started);
      return;
    }
    if (this.kind === 'waiting' || this.kind === 'paused') this.hide();
    if (this.kind === 'session') return;
    this.showTurn();
  }

  private showTurn(): void {
    const key = yourTurnKey(this.state, this.selfId, true);
    if (key && key !== this.lastKey) {
      this.lastKey = key;
      this.flash('turn', config.text);
    } else if (!key && this.kind === 'turn') this.hide();
  }

  private show(kind: string, text: string, hint = ''): void {
    if (this.kind === kind && this.title.textContent === text && !this.element.hidden) return;
    this.hide();
    this.kind = kind;
    this.element.dataset.kind = kind;
    this.title.textContent = text;
    this.hint.textContent = hint;
    this.hint.hidden = !hint;
    this.element.hidden = false;
  }

  private flash(kind: string, text: string): void {
    this.show(kind, text);
    this.timer = setTimeout(() => {
      this.hide();
      if (kind === 'session') this.showTurn();
    }, config.duration);
  }

  private hide(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.element.hidden = true;
    this.title.textContent = ''; this.hint.textContent = '';
    this.kind = '';
  }

  clear(): void { this.hide(); this.lastKey = null; this.state = null; }
  destroy(): void { this.clear(); this.element.remove(); }
}