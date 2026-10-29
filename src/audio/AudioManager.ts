import { audioConfig as config, type SoundEffect } from '../config/audio';
import { audioSettings, type AudioSettings } from './settings';

/** Stream one music track; cache only the short effects that are actually used. */
export class AudioManager {
  readonly music = document.createElement('audio');
  private settings: AudioSettings;
  private readonly defaults: AudioSettings = { muted: false, music: config.musicVolume, effects: config.effectsVolume };
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lastVariants = new Map<SoundEffect, string>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly listeners = new Set<() => void>();
  private active = false;
  private unlocked = false;
  private paused = false;
  private destroyed = false;
  private epoch = 0;
  private track = 0;

  constructor(private readonly parent: HTMLElement) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(config.storageKey); } catch { /* Optional storage. */ }
    this.settings = audioSettings(saved, this.defaults);
    this.music.preload = 'none'; this.music.hidden = true;
    this.music.setAttribute('aria-hidden', 'true');
    this.music.addEventListener('ended', this.nextTrack);
    parent.append(this.music);
    document.addEventListener('click', this.unlock, true);
    document.addEventListener('pointerdown', this.unlock, true);
    document.addEventListener('keydown', this.unlock, true);
    parent.addEventListener('click', this.click);
    parent.addEventListener('change', this.change);
    document.addEventListener('visibilitychange', this.visibility);
  }

  getSettings(): AudioSettings { return { ...this.settings }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  configure(settings: Partial<AudioSettings>): void {
    this.settings = audioSettings(JSON.stringify({ ...this.settings, ...settings }), this.defaults);
    try { localStorage.setItem(config.storageKey, JSON.stringify(this.settings)); } catch { /* Optional storage. */ }
    if (this.settings.muted || this.settings.effects === 0) this.stopEffects();
    this.sync();
    for (const listener of this.listeners) listener();
  }
  setActive(active: boolean): void { this.active = active; if (!active) this.stopEffects(); this.sync(); }
  setPaused(paused: boolean): void { if (paused !== this.paused) this.stopEffects(); this.paused = paused; this.sync(); }
  stopEffects(): void {
    this.epoch++;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
  }

  private readonly unlock = (): void => {
    if (!this.active || this.destroyed) return;
    this.unlocked = true;
    if (!this.context) {
      try { this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination); } catch { /* Music still works without Web Audio. */ }
    }
    if (this.context?.state === 'suspended' && !document.hidden) void this.context.resume().catch(() => {});
    this.sync();
  };
  private sync(): void {
    if (this.master) this.master.gain.value = this.settings.effects;
    this.music.volume = this.settings.music * (this.paused ? config.pausedMusicFactor : 1);
    if (!this.active || !this.unlocked || this.settings.muted || document.hidden || this.settings.music === 0 || this.destroyed) { this.music.pause(); return; }
    if (!this.music.getAttribute('src')) this.music.src = config.playlist[this.track];
    if (this.music.paused) void this.music.play().catch(() => { /* Retry after the next user gesture. */ });
  }
  private readonly nextTrack = (): void => {
    this.track = (this.track + 1) % config.playlist.length;
    this.music.src = config.playlist[this.track];
    this.sync();
  };
  private readonly visibility = (): void => {
    if (document.hidden) { this.stopEffects(); if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
    else if (this.unlocked && this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    this.sync();
  };
  private readonly click = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('button');
    // Roll buttons are sounded by the authoritative game state, for all players.
    if (button && !button.disabled && button.dataset.action !== 'roll'
      && !button.classList.contains('dice-panel__button') && !button.closest('.audio-controls')) {
      const action = button.dataset.action;
      this.play(action === 'choose' ? 'confirm' : 'click');
    }
    if (target?.closest('.audio-controls summary')) this.play('click');
  };
  private readonly change = (event: Event): void => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'radio') this.play('select');
  };

  play(key: SoundEffect, rate = 1): void {
    if (!this.context || !this.master || !this.active || !this.unlocked || this.settings.muted || !this.settings.effects || document.hidden || this.destroyed) return;
    const context = this.context;
    const epoch = this.epoch;
    const requestedAt = performance.now();
    const effect = config.effects[key];
    const urls: readonly string[] = 'variants' in effect ? effect.variants : [effect.url];
    const last = this.lastVariants.get(key);
    const candidates = urls.length > 1 ? urls.filter(url => url !== last) : urls;
    const url = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastVariants.set(key, url);
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url).then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes)).catch(() => null);
      this.buffers.set(url, buffer);
    }
    void buffer.then(decoded => {
      if (!decoded || epoch !== this.epoch || performance.now() - requestedAt > config.maxEffectDelay
        || !this.active || this.settings.muted || !this.settings.effects || document.hidden || this.destroyed || context.state !== 'running') return;
      if (this.voices.size >= config.maxVoices) { const oldest = this.voices.values().next().value; if (oldest) { this.voices.delete(oldest); try { oldest.stop(); } catch { /* Already ended. */ } } }
      const voice = context.createBufferSource(); const gain = context.createGain();
      voice.buffer = decoded; voice.playbackRate.value = rate; gain.gain.value = effect.gain;
      voice.connect(gain); gain.connect(this.master!); this.voices.add(voice);
      voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); };
      voice.start();
    });
  }

  destroy(): void {
    this.destroyed = true; this.stopEffects(); this.music.pause(); this.music.removeAttribute('src'); this.music.load(); this.music.remove();
    this.music.removeEventListener('ended', this.nextTrack);
    document.removeEventListener('click', this.unlock, true);
    document.removeEventListener('pointerdown', this.unlock, true); document.removeEventListener('keydown', this.unlock, true);
    this.parent.removeEventListener('click', this.click); this.parent.removeEventListener('change', this.change);
    document.removeEventListener('visibilitychange', this.visibility); this.listeners.clear();
    if (this.context) void this.context.close().catch(() => {});
  }
}



