import { diceConfig as config } from '../config/dice';
import type { DieValue } from '../../shared/game';
import './DicePanel.css';

const orientations: Record<DieValue, readonly [number, number]> = {
  1: [0, 0], 2: [-90, 0], 3: [0, -90],
  4: [0, 90], 5: [90, 0], 6: [0, 180],
};
const dots = [[5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];

/** The same solid die and animation, shared by the main tray and event cards. */
export class DiceView {
  readonly element = document.createElement('div');
  private readonly cube = document.createElement('div');
  private readonly bounce = document.createElement('div');
  private animations: Animation[] = [];
  private rotation = 'rotateX(0deg) rotateY(0deg)';
  private revision = 0;
  private destroyed = false;

  constructor() {
    this.element.className = 'dice-panel__tray';
    this.element.setAttribute('aria-hidden', 'true');
    for (const [key, color] of Object.entries(config.colors)) this.element.style.setProperty('--dice-' + key, color);
    this.bounce.className = 'dice-panel__bounce';
    const view = document.createElement('div'); view.className = 'dice-panel__view';
    this.cube.className = 'dice-panel__cube';
    dots.forEach((positions, index) => {
      const face = document.createElement('div');
      face.className = 'dice-panel__face dice-panel__face--' + (index + 1);
      for (const position of positions) {
        const pip = document.createElement('span'); pip.className = 'dice-panel__pip';
        pip.style.gridArea = Math.ceil(position / 3) + ' / ' + ((position - 1) % 3 + 1);
        face.append(pip);
      }
      this.cube.append(face);
    });
    view.append(this.cube); this.bounce.append(view); this.element.append(this.bounce);
  }
  setPaused(paused: boolean): void {
    for (const animation of this.animations) {
      if (paused) animation.pause(); else if (animation.playState === 'paused') animation.play();
    }
  }
  clear(): void {
    this.revision++;
    this.animations.forEach(animation => animation.cancel()); this.animations = [];
  }
  setResult(value: DieValue): void {
    this.clear();
    const [x, y] = orientations[value];
    this.rotation = 'rotateX(' + x + 'deg) rotateY(' + y + 'deg)';
    this.cube.style.transform = this.rotation;
  }
  async roll(value: DieValue, remainingMs: number = config.rollDuration): Promise<boolean> {
    if (this.destroyed) return false;
    if (remainingMs <= 0) { this.setResult(value); return true; }
    this.clear();
    const revision = this.revision;
    const [x, y] = orientations[value];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = Math.min(remainingMs, reducedMotion ? 150 : config.rollDuration);
    const target = 'rotateX(' + x + 'deg) rotateY(' + y + 'deg)';
    const spin = this.cube.animate([
      { transform: this.rotation },
      { transform: reducedMotion ? target : 'rotateX(' + (x + 1080) + 'deg) rotateY(' + (y + 1440) + 'deg)' },
    ], { duration, easing: 'cubic-bezier(0.16, 0.65, 0.25, 1)', fill: 'forwards' });
    const bounce = this.bounce.animate([
      { transform: 'translateY(0)', offset: 0 },
      { transform: 'translateY(-' + (reducedMotion ? 0 : config.jumpHeight) + 'px)', offset: .25 },
      { transform: 'translateY(0)', offset: .7 },
      { transform: 'translateY(-' + (reducedMotion ? 0 : 5) + 'px)', offset: .82 },
      { transform: 'translateY(0)', offset: 1 },
    ], { duration, easing: 'ease-in-out' });
    this.animations = [spin, bounce];
    try {
      await spin.finished;
      if (this.destroyed || revision !== this.revision) return false;
      this.rotation = target; this.cube.style.transform = target;
      this.animations.forEach(animation => animation.cancel()); this.animations = [];
      return true;
    } catch { return false; }
  }
  destroy(): void { this.destroyed = true; this.clear(); this.element.remove(); }
}