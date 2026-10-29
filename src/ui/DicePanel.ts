import { DiceView } from './DiceView';
import Phaser from 'phaser';
import { diceConfig as config } from '../config/dice';
import './DicePanel.css';

import type { DieValue } from '../../shared/game';

/** Fixed dice tray. Requests a roll; only the server supplies the result. */
export class DicePanel {
  private readonly element = document.createElement('section');
  private readonly die = new DiceView();
  private readonly button = document.createElement('button');
  private readonly status = document.createElement('div');
  private sequenceTimers: ReturnType<typeof setTimeout>[] = [];
  private summary = '';
  private rolling = false;
  private allowed = false;
  private paused = false;
  private turnMessage = 'Подключение…';
  private result: DieValue | null = null;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.element.className = 'dice-panel';
    this.element.setAttribute('aria-label', config.labels.panel);
    const style = this.element.style;
    style.setProperty('--dice-left', `${config.position.left}px`);
    style.setProperty('--dice-bottom', `${config.position.bottom}px`);
    style.setProperty('--dice-width', `${config.width}px`);
    style.setProperty('--dice-size', `${config.size}px`);
    for (const [key, color] of Object.entries(config.colors)) {
      style.setProperty(`--dice-${key}`, color);
    }

    this.status.className = 'dice-panel__status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = config.labels.ready;
    this.button.className = 'dice-panel__button';
    this.button.type = 'button';
    this.button.disabled = true;
    this.button.textContent = config.labels.roll;
    this.button.addEventListener('click', this.roll);
    this.element.append(this.die.element, this.status, this.button);
    scene.game.canvas.parentElement?.append(this.element);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  setAvailability(allowed: boolean, message: string): void {
    this.allowed = allowed;
    this.turnMessage = message;
    this.updateControls();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.cancelSequence();
    this.die.setPaused(paused);
    this.updateControls();
  }

  private updateControls(): void {
    this.element.classList.toggle('is-your-turn', this.allowed && !this.rolling && !this.paused);
    this.button.disabled = !this.allowed || this.rolling || this.paused;
    this.button.textContent = this.rolling ? config.labels.rolling : config.labels.roll;
    this.status.textContent = this.turnMessage + (this.result ? `\n${config.labels.result}: ${(this.summary || this.result)}` : '');
  }

  private readonly roll = (): void => {
    if (!this.allowed || this.rolling || this.paused || this.destroyed) return;
    this.scene.events.emit('dice:request');
  };

  private cancelSequence(): void {
    this.sequenceTimers.forEach(timer => clearTimeout(timer)); this.sequenceTimers = [];
  }
  showRolls(values: readonly DieValue[], remainingMs: number, modifier = 0): void {
    this.clearResult();
    const total = config.rollDuration * values.length;
    const elapsed = Math.max(0, total - remainingMs);
    const index = Math.min(values.length - 1, Math.floor(elapsed / config.rollDuration));
    if (remainingMs <= 0) { this.setRollResult(values, modifier); return; }
    this.showRoll(values[index], config.rollDuration * (index + 1) - elapsed);
    for (let i = index + 1; i < values.length; i++) {
      this.sequenceTimers.push(setTimeout(() => this.showRoll(values[i], config.rollDuration), config.rollDuration * i - elapsed));
    }
    this.sequenceTimers.push(setTimeout(() => this.setRollResult(values, modifier), remainingMs));
  }
  setRollResult(values: readonly DieValue[], modifier = 0): void {
    this.setResult(values.at(-1)!);
    const sum = Math.max(0, values.reduce((sum, value) => sum + value, 0) + modifier);
    this.summary = values.length > 1 || modifier !== 0
      ? values.join(' + ') + (modifier ? (modifier > 0 ? ' + ' : ' − ') + Math.abs(modifier) : '') + ' = ' + sum
      : '';
    this.updateControls();
  }
  clearResult(): void {
    this.cancelSequence(); this.summary = '';
    this.die.clear();
    this.rolling = false;
    this.result = null;
    this.updateControls();
  }

  setResult(result: DieValue): void {
    this.cancelSequence(); this.summary = '';
    this.die.clear();
    this.die.setResult(result);
    this.result = result;
    this.rolling = false;
    this.updateControls();
  }

  showRoll(result: DieValue, remainingMs: number = config.rollDuration): void {
    if (this.destroyed) return;
    if (remainingMs <= 0) { this.setResult(result); return; }
    this.rolling = true; this.result = null; this.updateControls();
    void this.die.roll(result, remainingMs).then(completed => {
      if (!completed || this.destroyed) return;
      this.result = result; this.rolling = false; this.updateControls();
    });
  }

  destroy(): void {
    this.cancelSequence();
    this.destroyed = true;
    this.die.clear();
    this.button.removeEventListener('click', this.roll);
    this.die.destroy(); this.element.remove();
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }
}
