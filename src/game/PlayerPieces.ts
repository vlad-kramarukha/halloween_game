import { samplePlayerMotion } from '../../shared/movement';
import { gameTextFont } from '../ui/game-fonts';
import Phaser from 'phaser';
import { Board } from './Board';
import { playerColors, type GameState } from '../../shared/game';

/** Positions are sampled from the server timeline, including when joining mid-turn. */
export class PlayerPieces {
  private readonly layer: Phaser.GameObjects.Container;
  private readonly pieces = new Map<string, Phaser.GameObjects.Container>();
  private state: GameState | null = null;
  private receivedAt = 0;
  private dirty = true;
  private wasMoving = false;

  constructor(private readonly scene: Phaser.Scene, private readonly board: Board) {
    this.layer = scene.add.container();
    board.add(this.layer);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
  }

  setState(state: GameState, selfId: string): void {
    this.state = state; this.receivedAt = performance.now(); this.dirty = true;
    for (const [id, piece] of this.pieces) if (!state.players.some(player => player.id === id)) {
      piece.destroy(); this.pieces.delete(id);
    }
    for (const player of state.players) {
      let piece = this.pieces.get(player.id);
      if (!piece) {
        piece = this.scene.add.container();
        const color = Phaser.Display.Color.RGBStringToColor(playerColors[player.slot]).color;
        const base = this.scene.add.ellipse(0, 0, 30, 13, color, .9).setStrokeStyle(1, 0xffffff, .75);
        const avatar = this.scene.add.image(0, -4, `character-${player.character}`).setDisplaySize(38, 38).setOrigin(.5, 1);
        const label = this.scene.add.text(0, -46, '', { fontFamily: gameTextFont, fontSize: 10, color: playerColors[player.slot], stroke: 'rgb(20, 14, 30)', strokeThickness: 3 }).setOrigin(.5, 1).setResolution(2);
        piece.add([base, avatar, label]);
        this.layer.add(piece); this.pieces.set(player.id, piece);
      }
      const label = piece.getAt(2) as Phaser.GameObjects.Text;
      label.setText(player.nickname + (player.id === selfId ? ' (ты)' : ''));
      piece.setAlpha(player.connected ? 1 : .4);
      (piece.getAt(0) as Phaser.GameObjects.Ellipse).setStrokeStyle(player.id === state.currentPlayerId ? 3 : 1, 0xffffff, .9);
    }
    this.update();
  }

  private update(): void {
    if (!this.state) return;
    const serverNow = this.state.serverTime + performance.now() - this.receivedAt;
    const deadline = this.state.phase === 'rolling' ? this.state.roll?.endsAt : this.state.phase === 'moving' ? this.state.movement?.endsAt : undefined;
    const moving = !this.state.paused && deadline !== undefined && serverNow < deadline;
    if (!this.dirty && !moving && !this.wasMoving) return;
    this.dirty = false; this.wasMoving = moving;
    for (const player of this.state.players) {
      const piece = this.pieces.get(player.id)!;
      const motion = samplePlayerMotion(this.state, player.id, serverNow);
      const position = motion.position;
      const start = this.board.getCellPosition(Math.floor(position));
      const end = this.board.getCellPosition(Math.ceil(position));
      const fraction = position % 1;
      const angle = player.slot * Math.PI * 2 / 10;
      piece.setPosition(Phaser.Math.Linear(start.x, end.x, fraction) + Math.cos(angle) * 25,
        Phaser.Math.Linear(start.y, end.y, fraction) + Math.sin(angle) * 11);
      (piece.getAt(1) as Phaser.GameObjects.Image).y = -4 - (motion.moving ? Math.sin(fraction * Math.PI) * 8 : 0);
      piece.setDepth(piece.y);
    }
    this.layer.sort('depth');
  }

  destroy(): void { this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this); this.layer.destroy(); this.pieces.clear(); }
}
