import { samplePlayerMotion } from '../../shared/movement';
import type { GameState } from '../../shared/game';
import { audioConfig } from '../config/audio';
import type { AudioManager } from './AudioManager';
import { stateCues } from './cues';

/** Network transitions and the shared movement timeline drive sound for every observer. */
export class GameAudio {
  private state: GameState | null = null;
  private receivedAt = 0;
  private stepCells = new Map<string, number>();
  private lastStepAt = -Infinity;
  private landedRoll = -1;
  constructor(private readonly audio: AudioManager) {}
  setState(state: GameState, selfId: string): void {
    this.tick();
    const previous = this.state;
    this.audio.setPaused(state.paused);
    for (const cue of stateCues(previous, state, selfId)) this.audio.play(cue);
    this.state = state; this.receivedAt = performance.now();
    if (!previous || previous.roll?.id !== state.roll?.id) this.landedRoll = state.roll && state.serverTime >= state.roll.moveAt ? state.roll.id : -1;
    const sameMotion = previous?.phase === state.phase && (state.phase === 'moving' ? previous.movement?.id === state.movement?.id : previous?.roll?.id === state.roll?.id);
    if (!sameMotion || !previous) {
      this.stepCells.clear();
      for (const player of state.players) this.stepCells.set(player.id, Math.floor(samplePlayerMotion(state, player.id, state.serverTime).position + 1e-6));
    }
  }
  readonly tick = (): void => {
    const state = this.state;
    if (!state || state.paused) return;
    const elapsed = performance.now() - this.receivedAt;
    const now = state.serverTime + elapsed;
    if (state.phase === 'rolling' && state.roll && now >= state.roll.moveAt && this.landedRoll !== state.roll.id) {
      this.landedRoll = state.roll.id; this.audio.play('land');
    }
    if (state.phase !== 'rolling' && state.phase !== 'moving') return;
    let stepped = false;
    for (const player of state.players) {
      const cell = Math.floor(samplePlayerMotion(state, player.id, now).position + 1e-6);
      const before = this.stepCells.get(player.id);
      if (before !== undefined && cell !== before) stepped = true;
      this.stepCells.set(player.id, cell);
    }
    const realNow = performance.now();
    if (stepped && realNow - this.lastStepAt >= audioConfig.minStepInterval) {
      this.lastStepAt = realNow; this.audio.play('step', .94 + Math.random() * .12);
    }
  };
  clear(): void { this.state = null; this.stepCells.clear(); this.landedRoll = -1; this.audio.stopEffects(); this.audio.setPaused(false); }
}