import Phaser from 'phaser';
import { loadGameFonts } from '../ui/game-fonts';
import { BoardVisibility } from './rendering/BoardVisibility';
import { sceneryConfig } from '../config/scenery';
import { GameSession } from './GameSession';
import { characters } from '../config/characters';
import { boardConfig } from '../config/board';
import { backgroundConfig } from '../config/background';
import { pickupsConfig } from '../config/pickups';
import { candiesConfig } from '../config/candies';
import { decorationsConfig } from '../config/decorations';
import { forestConfig } from '../config/forest';
import { Board } from './Board';
import { GameUI } from '../ui/GameUI';
import { DicePanel } from '../ui/DicePanel';
import { CameraController } from './CameraController';
import { renderConfig } from '../config/render';
import type { GameEntry } from '../entry/types';

class BoardScene extends Phaser.Scene {
  private failed = false;
  constructor(private readonly entry: GameEntry,
    private readonly ready: (game: Phaser.Game) => void,
    private readonly fail: (error: unknown) => void) {
    super('BoardScene');
  }

  preload(): void {
    this.load.on('progress', (progress: number) => this.entry.panel.setLoadingProgress(progress));
    this.load.once('loaderror', () => {
      this.failed = true;
      this.fail(new Error('Не удалось загрузить игровое поле. Обновите страницу и попробуйте снова.'));
      this.game.destroy(true);
    });
    for (const character of characters) this.load.image('character-' + character.id, character.url);
    this.load.image(backgroundConfig.image.textureKey, backgroundConfig.image.url);
    const props = [...Object.values(decorationsConfig.types), ...Object.values(forestConfig.types), ...Object.values(sceneryConfig.types)];
    for (const decor of new Map(props.map(prop => [prop.textureKey, prop])).values()) this.load.image(decor.textureKey, decor.url);
    for (const pickup of [...pickupsConfig.types, ...candiesConfig.types]) {
      if ('frameWidth' in pickup) this.load.spritesheet(pickup.textureKey, pickup.url, { frameWidth: pickup.frameWidth, frameHeight: pickup.frameHeight });
      else this.load.image(pickup.textureKey, pickup.url);
    }
  }

  create(): void {
    if (this.failed) return;
    try {
      const camera = new CameraController(this);
      const board = new Board(this);
      const ui = new GameUI(this);
      const dice = new DicePanel(this);
      camera.fitBounds(board.getEnvironmentBounds());
      camera.setMovementBounds(board.getNavigationBounds());
      new BoardVisibility(this, board);
      new GameSession(this, board, ui, dice, this.entry);
      this.ready(this.game);
    } catch (error) { this.failed = true; this.fail(error); this.game.destroy(true); }
  }
}

/** Phaser and environment textures load only after an explicit join or saved-session restore. */
export async function startGame(entry: GameEntry): Promise<Phaser.Game> {
  await loadGameFonts();
  return new Promise((resolve, reject) => {
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      fps: { target: renderConfig.frameRate, limit: renderConfig.frameRate },
      loader: { maxParallelDownloads: renderConfig.maxParallelDownloads },
      backgroundColor: Phaser.Display.Color.RGBStringToColor(boardConfig.colors.background).color,
      antialias: true,
      antialiasGL: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: renderConfig.width * renderConfig.resolutionScale,
        height: renderConfig.height * renderConfig.resolutionScale,
      },
      scene: [new BoardScene(entry, resolve, reject)],
    });
  });
}