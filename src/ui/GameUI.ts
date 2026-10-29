import Phaser from 'phaser';
import { uiConfig as config, type UIPlayer } from '../config/ui';
import './GameUI.css';

/** DOM overlay: remains fixed while the world camera moves or zooms. */
export class GameUI {
  private readonly element: HTMLElement;
  private readonly players: HTMLUListElement;
  private playersSignature = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.element = document.createElement('aside');
    this.element.className = 'game-ui';
    this.element.setAttribute('aria-label', 'Игровой интерфейс');
    const style = this.element.style;
    style.setProperty('--ui-top', `${config.position.top}px`);
    style.setProperty('--ui-left', `${config.position.left}px`);
    style.setProperty('--ui-right', `${config.position.right}px`);
    style.setProperty('--ui-avatar-size', `${config.avatarSize}px`);
    style.setProperty('--ui-player-width', `${config.playerWidth}px`);
    style.setProperty('--ui-self-avatar-size', config.selfAvatarSize);
    style.setProperty('--ui-self-player-width', String(config.selfPlayerWidth) + 'px');
    style.setProperty('--ui-player-gap', `${config.playerGap}px`);
    style.setProperty('--ui-exit-size', `${config.exitSize}px`);
    for (const [key, color] of Object.entries(config.colors)) {
      style.setProperty(`--ui-${key}`, color);
    }

    this.players = document.createElement('ul');
    this.players.className = 'game-ui__players';
    this.players.setAttribute('aria-label', config.labels.players);
    this.players.tabIndex = 0;
    this.setPlayers([]);

    const exitWrapper = document.createElement('div');
    exitWrapper.className = 'game-ui__exit-wrapper';
    const exit = document.createElement('button');
    exit.className = 'game-ui__exit';
    exit.type = 'button';
    exit.setAttribute('aria-label', config.labels.exit);
    exit.addEventListener('click', () => scene.events.emit('game:leave-request'));
    const tooltip = document.createElement('span');
    tooltip.className = 'game-ui__tooltip';
    tooltip.id = `game-exit-tooltip-${scene.sys.settings.key}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = config.labels.exitTooltip;
    exit.setAttribute('aria-describedby', tooltip.id);
    const exitImage = document.createElement('img');
    exitImage.src = config.icons.exit;
    exitImage.alt = '';
    exitImage.draggable = false;
    exit.append(exitImage);
    exitWrapper.append(exit, tooltip);

    this.element.append(this.players, exitWrapper);
    scene.game.canvas.parentElement?.append(this.element);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  setYourTurn(active: boolean): void {
    this.element.classList.toggle('is-your-turn', active);
  }

  setPlayers(players: readonly UIPlayer[]): void {
    const signature = JSON.stringify(players);
    if (signature === this.playersSignature) return;
    this.playersSignature = signature;
    if (!players.length) this.setYourTurn(false);
    const ordered = [...players.filter(player => player.self), ...players.filter(player => !player.self)];
    this.players.replaceChildren(...ordered.map(player => {
      const item = document.createElement('li');
      item.className = 'game-ui__player';
      item.dataset.playerId = player.id;
      item.classList.toggle('game-ui__player--self', !!player.self);
      item.classList.toggle('game-ui__player--active', !!player.active);
      item.classList.toggle('game-ui__player--offline', player.connected === false);
      if (player.color) item.style.setProperty('--player-color', player.color);
      item.title = player.connected === false ? 'Нет связи' : player.active ? 'Текущий ход' : player.nickname;
      const avatar = document.createElement('div');
      avatar.className = 'game-ui__avatar';
      avatar.setAttribute('role', 'img');
      avatar.setAttribute('aria-label', `${config.labels.avatar}: ${player.nickname}`);
      if (player.avatarUrl) {
        const image = document.createElement('img');
        image.src = player.avatarUrl;
        image.alt = '';
        image.draggable = false;
        avatar.classList.add('game-ui__avatar--image');
        image.addEventListener('error', () => {
          image.remove();
          avatar.classList.remove('game-ui__avatar--image');
        }, { once: true });
        avatar.append(image);
      }
      const nickname = document.createElement('span');
      nickname.className = 'game-ui__nickname';
      nickname.textContent = player.nickname;
      nickname.title = player.nickname;
      item.append(avatar, nickname);
      return item;
    }));
  }

  destroy(): void {
    this.element.remove();
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }
}
