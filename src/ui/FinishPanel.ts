import type { GameState } from '../../shared/game';
import { characters } from '../config/characters';
import { finishConfig as config } from '../config/finish';
import './FinishPanel.css';

/** Persistent final result for both the winner and the rest of the room. */
export class FinishPanel {
  private readonly element = document.createElement('section');
  private signature = '';
  private previousFocus: HTMLElement | null = null;

  constructor(parent: HTMLElement, private readonly leave: () => void) {
    this.element.className = 'finish-panel';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'finish-title');
    this.element.addEventListener('keydown', this.onKey);
    parent.append(this.element);
  }

  setState(state: GameState, selfId: string): void {
    if (state.phase !== 'finished' || !state.winnerId) { this.clear(); return; }
    const winner = state.winner ?? state.players.find(player => player.id === state.winnerId);
    if (!winner) { this.clear(); return; }
    const mine = winner.id === selfId;
    const signature = JSON.stringify([state.roomId, winner.id, winner.nickname, winner.character, mine]);
    if (signature === this.signature) return;
    this.signature = signature;
    const opening = this.element.hidden;
    if (opening) this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = document.createElement('div');
    card.className = 'finish-panel__card';
    card.classList.toggle('finish-panel__card--winner', mine);
    const eyebrow = document.createElement('p'); eyebrow.className = 'finish-panel__eyebrow';
    eyebrow.textContent = 'HALLOWEEN HR · ИГРА ЗАВЕРШЕНА';
    const title = document.createElement('h2');
    title.id = 'finish-title'; title.tabIndex = -1;
    title.textContent = mine ? config.winnerTitle : config.observerTitle;
    card.append(eyebrow, title);
    const character = characters.find(character => character.id === winner.character);
    if (character) {
      const avatar = document.createElement('img');
      avatar.className = 'finish-panel__avatar';
      avatar.src = character.url; avatar.alt = character.name; avatar.draggable = false;
      avatar.width = 112; avatar.height = 112;
      card.append(avatar);
    }
    const name = document.createElement('p'); name.className = 'finish-panel__name';
    name.textContent = mine ? winner.nickname : config.observerText + ' — ' + winner.nickname + '!';
    card.append(name);
    if (mine) {
      const subtitle = document.createElement('p'); subtitle.className = 'finish-panel__subtitle';
      subtitle.textContent = config.winnerSubtitle;
      card.append(subtitle);
      for (const paragraph of config.winnerParagraphs) {
        const text = document.createElement('p'); text.className = 'finish-panel__text'; text.textContent = paragraph; card.append(text);
      }
    }
    const closing = document.createElement('p'); closing.className = 'finish-panel__closing';
    closing.textContent = mine ? config.welcome : config.observerFooter;
    const exit = document.createElement('button'); exit.type = 'button';
    exit.textContent = config.exit; exit.onclick = this.leave;
    card.append(closing, exit);
    this.element.replaceChildren(card);
    this.element.hidden = false;
    if (opening) title.focus({ preventScroll: true });
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    this.element.querySelector('button')?.focus();
  };

  clear(): void {
    if (this.element.hidden) return;
    this.element.hidden = true; this.element.replaceChildren(); this.signature = '';
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  destroy(): void { this.clear(); this.element.removeEventListener('keydown', this.onKey); this.element.remove(); }
}