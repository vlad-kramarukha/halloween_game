import { GameAudio } from '../audio/GameAudio';
import { WelcomePanel } from '../ui/WelcomePanel';
import type { GameEntry } from '../entry/types';
import { FinishPanel } from '../ui/FinishPanel';
import { canRoll } from './session-controls';
import { TurnNotice } from '../ui/TurnNotice';
import { OrangeCellEffect } from './OrangeCellEffect';
import { EventPanel } from '../ui/EventPanel';
import type { EventAction } from '../../shared/events';
import { renderConfig } from '../config/render';
import Phaser from 'phaser';
import { io, type Socket } from 'socket.io-client';
import { characters } from '../config/characters';
import { playerColors, type ClientEvents, type GameState, type JoinRequest, type ServerEvents } from '../../shared/game';
import { Board } from './Board';
import { PlayerPieces } from './PlayerPieces';
import { DicePanel } from '../ui/DicePanel';
import { GameUI } from '../ui/GameUI';
import { JoinPanel } from '../ui/JoinPanel';
import { ProgressTrack } from '../ui/ProgressTrack';

export class GameSession {
  private readonly socket: Socket<ServerEvents, ClientEvents>;
  private readonly pieces: PlayerPieces;
  private readonly gameAudio: GameAudio;
  private readonly joinPanel: JoinPanel;
  private readonly progress: ProgressTrack;
  private readonly turnNotice: TurnNotice;
  private readonly eventPanel: EventPanel;
  private readonly finishPanel: FinishPanel;
  private readonly welcomePanel: WelcomePanel;
  private welcomeOpen = false;
  private readonly welcomed = new Set<string>();
  private readonly eventCue: OrangeCellEffect;
  private lastCue = 0;
  private pickupsReady = false;
  private lastEventRoll = '';
  private readonly roomId = new URLSearchParams(location.search).get('room') || 'demo';
  private readonly invitationToken = new URLSearchParams(location.search).get('invite') || undefined;
  private readonly storageKey = `halloween-session:${this.roomId}`;
  private saved: JoinRequest | null = null;
  private state: GameState | null = null;
  private selfId = '';
  private lastRoll = -1;
  private pending = false;
  private destroyed = false;
  private joinAttempt = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly board: Board, private readonly ui: GameUI, private readonly dice: DicePanel, entry: GameEntry) {
    this.gameAudio = new GameAudio(entry.audio);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.gameAudio.tick);
    scene.game.loop.setFPSLimit(renderConfig.entryFrameRate);
    this.pieces = new PlayerPieces(scene, board);
    this.eventCue = new OrangeCellEffect(scene, board);
    this.progress = new ProgressTrack(scene.game.canvas.parentElement!);
    this.turnNotice = new TurnNotice(scene.game.canvas.parentElement!);
    this.eventPanel = new EventPanel(scene.game.canvas.parentElement!, request => this.requestEvent(request), id => board.getPickupImage(id));
    this.finishPanel = new FinishPanel(scene.game.canvas.parentElement!, () => this.leave());
    this.welcomePanel = new WelcomePanel(scene.game.canvas.parentElement!, () => {
      this.welcomeOpen = false;
      this.scene.input.enabled = !!this.state && !this.state.paused && this.state.phase !== 'event' && this.state.phase !== 'finished';
      this.updateControls();
    });
    this.ui.setPlayers([]);
    this.dice.setAvailability(false, 'Подключение…');
    this.saved = entry.request;
    this.socket = io({ autoConnect: false });
    this.joinPanel = entry.panel;
    this.joinPanel.setHandlers((nickname, character) => this.join({ roomId: this.roomId, nickname, character }), () => this.socket.connect());
    this.setGameplayVisible(false);
    this.socket.on('connect', () => {
      this.joinAttempt++;
      this.gameAudio.clear();
      this.pickupsReady = false; this.lastCue = 0; this.state = null; this.lastRoll = -1; this.lastEventRoll = ''; this.pending = false;
      this.joinPanel.setConnection(true);
      if (this.saved) this.join({ ...this.saved, roomId: this.roomId });
    });
    this.socket.on('disconnect', () => {
      this.gameAudio.clear(); entry.audio.setPaused(true);
      this.joinAttempt++;
      this.pending = false; this.dice.setPaused(true); this.turnNotice.clear(); this.ui.setYourTurn(false); this.dice.setAvailability(false, 'Связь потеряна…'); this.joinPanel.setConnection(false);
      if (this.state) this.eventPanel.setState(this.state, this.selfId, false);
    });
    this.socket.on('game:kicked', notice => {
      this.joinAttempt++;
      this.setGameplayVisible(false);
      this.saved = null;
      try { sessionStorage.removeItem(this.storageKey); } catch { /* Optional storage. */ }
      this.socket.disconnect();
      if (this.state) this.pieces.setState({ ...this.state, players: [], roll: null, phase: 'waiting' }, '');
      this.state = null; this.selfId = ''; this.pending = false;
      this.finishPanel.clear();
      this.ui.setPlayers([]);
      this.progress.clear(); this.eventPanel.clear(); this.eventCue.clear();
      this.dice.clearResult();
      this.dice.setAvailability(false, 'Вы исключены из комнаты');
      this.joinPanel.showRemoved(notice.message);
    });
    this.socket.on('connect_error', () => {
      this.dice.setAvailability(false, 'Нет связи с сервером'); this.joinPanel.setConnection(false);
    });
    this.socket.on('game:state', state => { if (this.selfId) this.applyState(state); });
    scene.events.on('game:leave-request', this.leave, this);
    scene.events.on('dice:request', this.requestRoll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    this.socket.connect();
  }

  private setGameplayVisible(visible: boolean): void {
    if (!visible) { this.gameAudio.clear(); this.welcomeOpen = false; this.welcomePanel.clear(); this.turnNotice.clear(); this.finishPanel.clear(); }
    this.scene.scene.setVisible(visible);
    this.scene.scene.setActive(visible);
    this.scene.input.enabled = visible;
    this.scene.game.loop.setFPSLimit(visible ? renderConfig.frameRate : renderConfig.entryFrameRate);
  }

  private join(request: JoinRequest): void {
    const attempt = ++this.joinAttempt;
    this.socket.timeout(5000).emit('game:join', { ...request, invitationToken: this.invitationToken }, (error, reply) => {
      if (this.destroyed || attempt !== this.joinAttempt) return;
      if (error) { this.setGameplayVisible(false); this.joinPanel.showError('Сервер не ответил. Переподключаемся…'); this.socket.disconnect().connect(); return; }
      if (!reply.ok) {
        this.saved = null;
        try { sessionStorage.removeItem(this.storageKey); } catch { /* Optional storage. */ }
        this.joinPanel.setProfile();
        this.setGameplayVisible(false); this.joinPanel.showError(reply.error); return;
      }
      this.selfId = reply.playerId;
      const player = reply.state.players.find(player => player.id === this.selfId)!;
      this.saved = { roomId: this.roomId, token: reply.token, nickname: player.nickname, character: player.character };
      try { sessionStorage.setItem(this.storageKey, JSON.stringify(this.saved)); } catch { /* Optional storage. */ }
      this.setGameplayVisible(true);
      this.joinPanel.hide(); this.applyState(reply.state);
      const welcomeKey = 'halloween-welcome:' + this.roomId + ':' + this.selfId;
      let seen = this.welcomed.has(this.selfId);
      try { seen ||= sessionStorage.getItem(welcomeKey) === '1'; } catch { /* Storage is optional. */ }
      if (!seen && reply.state.phase !== 'finished') {
        this.welcomed.add(this.selfId);
        try { sessionStorage.setItem(welcomeKey, '1'); } catch { /* Storage is optional. */ }
        this.welcomeOpen = true;
        this.welcomePanel.show();
        this.scene.input.enabled = false;
        this.updateControls();
      }
    });
  }

  private applyState(state: GameState): void {
    if (this.state && state.revision < this.state.revision) return;
    if (this.state?.paused && !state.paused) { this.lastRoll = -1; this.lastEventRoll = ''; }
    if (state.phase !== 'ready' || state.turnId !== this.state?.turnId) this.pending = false;
    if (state.phase === 'finished') { this.welcomeOpen = false; this.welcomePanel.clear(); }
    this.gameAudio.setState(state, this.selfId);
    this.state = state;
    this.scene.game.loop.setFPSLimit(!state.started || state.paused || state.phase === 'finished' ? renderConfig.entryFrameRate : renderConfig.frameRate);
    this.turnNotice.setState(state, this.selfId, this.socket.connected);
    this.board.setCollectedPickups(state.collectedPickups ?? [], this.pickupsReady);
    this.pickupsReady = true;
    this.pieces.setState(state, this.selfId);
    this.progress.setState(state, this.selfId);
    if (state.phase === 'event' && state.event && state.event.id !== this.lastCue) {
      this.lastCue = state.event.id;
      const actor = state.players.find(player => player.id === state.event!.playerId);
      if (actor && state.event.source === 'orange' && state.serverTime - state.event.startedAt < 1000) this.eventCue.play(actor.position);
    } else if (state.phase !== 'event') this.eventCue.clear();
    this.eventPanel.setState(state, this.selfId, this.socket.connected);
    this.finishPanel.setState(state, this.selfId);
    this.scene.input.enabled = !this.welcomeOpen && !state.paused && state.phase !== 'event' && state.phase !== 'finished';
    this.ui.setPlayers(state.players.map(player => ({
      id: player.id, nickname: player.nickname + (player.id === this.selfId ? ' (ты)' : ''),
      avatarUrl: characters.find(character => character.id === player.character)!.url,
      self: player.id === this.selfId, active: player.id === state.currentPlayerId, connected: player.connected, color: playerColors[player.slot],
    })));
    if (state.phase === 'event' && state.event) {
      const event = state.event;
      const key = event.id + ':' + event.dice.length;
      if (event.stage === 'rolling' && key !== this.lastEventRoll) {
        this.lastEventRoll = key;
        this.dice.showRoll(event.dice.at(-1)! as 1 | 2 | 3 | 4 | 5 | 6, Math.max(0, (event.rollEndsAt ?? state.serverTime) - state.serverTime));
      } else if (event.stage !== 'rolling') {
        if (event.dice.length) this.dice.setResult(event.dice.at(-1)! as 1 | 2 | 3 | 4 | 5 | 6);
        else this.dice.clearResult();
      }
    } else if (state.phase === 'ready' && state.currentPlayerId === this.selfId) {
      this.dice.clearResult();
    } else if (state.roll && state.phase === 'rolling' && state.roll.id !== this.lastRoll) {
      this.lastRoll = state.roll.id;
      this.dice.showRolls(state.roll.values ?? [state.roll.value], Math.max(0, state.roll.moveAt - state.serverTime), state.roll.modifier ?? 0);
    } else if (state.roll && state.phase !== 'rolling') this.dice.setRollResult(state.roll.values ?? [state.roll.value], state.roll.modifier ?? 0);
    else if (!state.roll) { this.lastRoll = -1; this.dice.clearResult(); }
    this.dice.setPaused(state.paused);
    this.updateControls();
  }

  private updateControls(): void {
    const state = this.state;
    if (!state || !this.socket.connected) { this.ui.setYourTurn(false); return; }
    const current = state.players.find(player => player.id === state.currentPlayerId);
    const mine = state.currentPlayerId === this.selfId;
    this.ui.setYourTurn(canRoll(state, this.selfId, this.socket.connected, this.pending || this.welcomeOpen));
    let message = mine ? 'Твой ход' : `Ход: ${current?.nickname ?? '—'}`;
    if (mine && state.phase === 'ready') {
      const effects = current?.effects;
      if (effects?.nextRollTwice) message += '\nДва броска в этом ходу';
      if (effects?.nextRollModifier) message += '\nК броску: ' + (effects.nextRollModifier > 0 ? '+' : '') + effects.nextRollModifier;
    }
    if (state.phase === 'event') message = 'Событие: ' + (state.players.find(player => player.id === state.event?.playerId)?.nickname ?? 'игрок');
    if (state.phase === 'moving') message = 'Выполняем событие…';
    if (state.phase === 'waiting') message = state.started ? 'Ждём второго игрока' : '';
    if (state.phase === 'rolling') message = `Ходит: ${current?.nickname ?? '—'}`;
    if (state.phase === 'finished') message = `Победил: ${state.winner?.nickname ?? state.players.find(player => player.id === state.winnerId)?.nickname ?? 'игрок'}`;
    if (state.notice && (state.phase === 'ready' || state.phase === 'waiting')) message += '\n' + state.notice;
    if (state.paused) message = '';
    this.dice.setAvailability(canRoll(state, this.selfId, this.socket.connected, this.pending || this.welcomeOpen), message);
  }

  private leave(): void {
    if (!this.selfId || this.destroyed) return;
    const attempt = ++this.joinAttempt;
    this.saved = null;
    try { sessionStorage.removeItem(this.storageKey); } catch { /* Optional storage. */ }
    this.setGameplayVisible(false);
    if (this.state) this.pieces.setState({ ...this.state, players: [], roll: null, phase: 'waiting' }, '');
    this.state = null; this.selfId = ''; this.pending = false; this.lastRoll = -1;
    this.finishPanel.clear();
    this.ui.setPlayers([]); this.progress.clear(); this.eventPanel.clear(); this.eventCue.clear(); this.dice.clearResult();
    this.dice.setAvailability(false, 'Вы вышли из игры');
    this.joinPanel.showWelcome();
    const reconnect = () => {
      if (this.destroyed || attempt !== this.joinAttempt) return;
      this.socket.disconnect().connect();
    };
    if (this.socket.connected) this.socket.timeout(3000).emit('game:leave', reconnect);
    else reconnect();
  }

  private requestEvent(request: EventAction): Promise<void> {
    if (this.welcomeOpen || !this.socket.connected || this.state?.paused || this.state?.phase !== 'event' || this.state.event?.playerId !== this.selfId) return Promise.reject(new Error('Сейчас нельзя выполнить действие.'));
    const attempt = this.joinAttempt;
    return new Promise((resolve, reject) => {
      this.socket.timeout(5000).emit('game:event', request, (error, reply) => {
        if (this.destroyed || attempt !== this.joinAttempt) { resolve(); return; }
        if (error) { reject(new Error('Сервер не ответил. Дождитесь восстановления связи.')); return; }
        if (!reply.ok) reject(new Error(reply.error)); else resolve();
      });
    });
  }

  private requestRoll(): void {
    if (this.welcomeOpen || !canRoll(this.state, this.selfId, this.socket.connected, this.pending)) return;
    this.pending = true; this.updateControls();
    const sessionAttempt = this.joinAttempt;
    const turnId = this.state!.turnId;
    this.socket.timeout(5000).emit('game:roll', { turnId }, (error, reply) => {
      if (this.destroyed || sessionAttempt !== this.joinAttempt) return;
      if (error) {
        this.dice.setAvailability(false, 'Восстанавливаем связь…');
        this.socket.disconnect().connect(); return;
      }
      this.pending = false; this.updateControls();
      if (!reply.ok && this.state?.turnId === turnId) this.dice.setAvailability(canRoll(this.state, this.selfId, this.socket.connected, this.pending), reply.error);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.gameAudio.clear(); this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.gameAudio.tick);
    this.destroyed = true; this.socket.removeAllListeners(); this.socket.disconnect();
    this.joinPanel.destroy(); this.pieces.destroy(); this.progress.destroy(); this.eventPanel.destroy(); this.eventCue.destroy(); this.turnNotice.destroy(); this.finishPanel.destroy(); this.welcomePanel.destroy();
    this.scene.events.off('game:leave-request', this.leave, this);
    this.scene.events.off('dice:request', this.requestRoll, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }
}
