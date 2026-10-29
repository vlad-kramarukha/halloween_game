import { characters } from '../config/characters';
import { progressConfig as config } from '../config/progress';
import { diceConfig } from '../config/dice';
import { gameConfig, playerColors, type GameState } from '../../shared/game';
import { layoutProgress, sampleProgress, type ProgressMarker } from './progress-layout';
import './ProgressTrack.css';

interface Marker { button: HTMLButtonElement; image: HTMLImageElement; cell: HTMLSpanElement; line: SVGLineElement; dot: SVGCircleElement }

/** Compact DOM track. No frame loop while players are stationary. */
export class ProgressTrack {
  private readonly element = document.createElement('aside');
  private readonly leader = document.createElement('span');
  private readonly personal = document.createElement('span');
  private readonly rail = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly tooltip = document.createElement('div');
  private readonly markers = new Map<string, Marker>();
  private readonly observer: ResizeObserver;
  private placements: ProgressMarker[] = [];
  private readonly links = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private state: GameState | null = null;
  private selfId = '';
  private receivedAt = 0;
  private width = 500;
  private openKey: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    this.element.className = 'progress-track'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Прогресс игроков от старта до финиша');
    const style = this.element.style;
    style.setProperty('--progress-left', `${diceConfig.position.left + diceConfig.width + config.diceGap}px`);
    style.setProperty('--progress-bottom', `${config.bottom}px`);
    style.setProperty('--progress-side', `${config.sideGap}px`);
    style.setProperty('--progress-width', `${config.maxWidth}px`);
    style.setProperty('--progress-lane-spacing', String(config.laneSpacing) + 'px');
    style.setProperty('--progress-rail-y', String(config.railY) + 'px');
    style.setProperty('--progress-marker', `${config.markerSize}px`);
    for (const [key, value] of Object.entries(config.colors)) style.setProperty(`--progress-${key}`, value);
    const header = document.createElement('div'); header.className = 'progress-track__header';
    this.leader.className = 'progress-track__leader'; this.personal.className = 'progress-track__personal';
    header.append(this.leader, this.personal);
    this.rail.className = 'progress-track__rail';
    const line = document.createElement('div'); line.className = 'progress-track__line';
    this.fill.className = 'progress-track__fill'; line.append(this.fill); this.rail.append(line);
    this.links.classList.add('progress-track__links'); this.links.setAttribute('aria-hidden', 'true'); this.rail.append(this.links);
    const ends = document.createElement('div'); ends.className = 'progress-track__ends';
    const start = document.createElement('span'); start.textContent = '1 · Старт';
    const finish = document.createElement('span'); finish.textContent = `Финиш · ${gameConfig.cellCount}`;
    ends.append(start, finish);
    this.tooltip.id = 'progress-player-tooltip'; this.tooltip.className = 'progress-track__tooltip';
    this.tooltip.setAttribute('role', 'tooltip'); this.tooltip.hidden = true;
    this.element.append(header, this.rail, ends, this.tooltip); parent.append(this.element);
    this.observer = new ResizeObserver(() => { this.width = this.rail.clientWidth; this.render(); });
    this.observer.observe(this.rail);
    document.addEventListener('pointerdown', this.onOutside);
    document.addEventListener('keydown', this.onKey);
  }

  setState(state: GameState, selfId: string): void {
    clearTimeout(this.timer);
    this.state = state; this.selfId = selfId; this.receivedAt = performance.now();
    this.element.hidden = state.players.length === 0;
    this.width = this.rail.clientWidth || this.width;
    this.tick();
  }

  clear(): void {
    clearTimeout(this.timer); this.state = null; this.element.hidden = true; this.closeTooltip();
    for (const marker of this.markers.values()) { marker.button.remove(); marker.line.remove(); marker.dot.remove(); }
    this.markers.clear(); this.placements = [];
  }

  private readonly tick = (): void => {
    this.render();
    const state = this.state;
    if (!state?.paused && ((state?.phase === 'rolling' && state.roll) || (state?.phase === 'moving' && state.movement))) {
      const now = state.serverTime + performance.now() - this.receivedAt;
      if (now < (state.movement?.endsAt ?? state.roll?.endsAt ?? now)) this.timer = setTimeout(this.tick, config.updateInterval);
    }
  };

  private render(): void {
    if (!this.state) return;
    const now = this.state.serverTime + performance.now() - this.receivedAt;
    const players = sampleProgress(this.state, now, gameConfig.cellCount);
    const leaders = players.filter(player => player.rank === 1);
    this.leader.textContent = leaders.length === 1 ? `Впереди: ${leaders[0].nickname}` : leaders.length ? `Делят первое место: ${leaders.length}` : '';
    this.leader.title = leaders.map(player => player.nickname).join(', ');
    const self = players.find(player => player.id === this.selfId);
    this.personal.textContent = self ? `Ты: ${self.cell} / ${gameConfig.cellCount}` : '';
    this.fill.style.width = `${(players[0]?.progress ?? 0) * 100}%`;
    this.placements = layoutProgress(players, this.width, config.markerGap);
    const keys = new Set(players.map(player => player.id));
    for (const [key, marker] of this.markers) if (!keys.has(key)) {
      marker.button.remove(); marker.line.remove(); marker.dot.remove(); this.markers.delete(key);
      if (this.openKey === key) this.closeTooltip();
    }
    for (const placement of this.placements) {
      const player = placement.player;
      let marker = this.markers.get(player.id);
      if (!marker) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'progress-track__marker';
        const image = document.createElement('img'); image.alt = ''; image.draggable = false;
        const cell = document.createElement('span'); cell.className = 'progress-track__cell';
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '2.5');
        this.links.append(line, dot); button.append(image, cell);
        button.addEventListener('mouseenter', () => this.showTooltip(player.id));
        button.addEventListener('mouseleave', () => { if (document.activeElement !== button) this.closeTooltip(); });
        button.addEventListener('focus', () => this.showTooltip(player.id));
        button.addEventListener('blur', () => this.closeTooltip());
        button.addEventListener('click', () => this.showTooltip(player.id));
        this.rail.append(button); marker = { button, image, cell, line, dot }; this.markers.set(player.id, marker);
      }
      const avatar = characters.find(character => character.id === player.character)!.url;
      if (marker.image.getAttribute('src') !== avatar) marker.image.src = avatar;
      marker.button.style.left = `${placement.x}px`;
      marker.button.style.top = `${placement.lane * config.laneSpacing}px`;
      marker.button.style.setProperty('--marker-color', playerColors[player.slot]);
      marker.button.classList.toggle('is-self', player.id === this.selfId);
      marker.button.classList.toggle('is-active', player.id === this.state.currentPlayerId);
      marker.button.classList.toggle('is-offline', !player.connected);
      marker.button.setAttribute('aria-label', `${player.nickname}${player.id === this.selfId ? ' (ты)' : ''}: клетка ${player.cell}, место ${player.rank}${player.connected ? '' : ', нет связи'}`);
      marker.cell.textContent = String(player.cell);
      marker.line.setAttribute('x1', String(placement.anchorX)); marker.line.setAttribute('y1', String(config.railY));
      marker.line.setAttribute('x2', String(placement.x));
      marker.line.setAttribute('y2', String(placement.lane === 0 ? config.markerSize : config.laneSpacing));
      marker.line.setAttribute('stroke', playerColors[player.slot]); marker.line.setAttribute('opacity', player.connected ? '.4' : '.15');
      marker.dot.setAttribute('cx', String(placement.anchorX)); marker.dot.setAttribute('cy', String(config.railY));
      marker.dot.setAttribute('fill', playerColors[player.slot]);
    }
    if (this.openKey) this.showTooltip(this.openKey);
  }

  private showTooltip(key: string): void {
    const placement = this.placements.find(item => item.player.id === key);
    if (!placement) return;
    const player = placement.player;
    if (this.openKey !== key) this.closeTooltip();
    this.openKey = key; this.tooltip.hidden = false;
    const tooltipWidth = Math.min(340, window.innerWidth - 32);
    this.tooltip.style.left = Math.max(0, Math.min(24 + placement.x - tooltipWidth / 2, this.element.clientWidth - tooltipWidth)) + 'px';
    this.markers.get(key)?.button.setAttribute('aria-describedby', this.tooltip.id);
    const signature = `${player.id}:${player.cell}:${player.rank}:${player.connected}`;
    if (this.tooltip.dataset.signature === signature) return;
    this.tooltip.dataset.signature = signature; this.tooltip.replaceChildren();
    const title = document.createElement('strong'); title.textContent = 'Положение игрока'; this.tooltip.append(title);
    const row = document.createElement('div'); row.className = 'progress-track__detail';
    const name = document.createElement('span'); name.textContent = `${player.nickname}${player.id === this.selfId ? ' (ты)' : ''}${player.connected ? '' : ' · нет связи'}`;
    name.style.color = playerColors[player.slot];
    const position = document.createElement('span'); position.textContent = `#${player.rank} · клетка ${player.cell}`;
    row.append(name, position); this.tooltip.append(row);
  }
  private closeTooltip(): void {
    if (this.openKey) this.markers.get(this.openKey)?.button.removeAttribute('aria-describedby');
    this.openKey = null; this.tooltip.hidden = true;
  }
  private readonly onOutside = (event: PointerEvent): void => { if (!this.element.contains(event.target as Node)) this.closeTooltip(); };
  private readonly onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') this.closeTooltip(); };
  destroy(): void {
    this.clear(); this.observer.disconnect(); this.element.remove();
    document.removeEventListener('pointerdown', this.onOutside); document.removeEventListener('keydown', this.onKey);
  }
}
