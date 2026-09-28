import Phaser from 'phaser';
import { fmt } from '../config';
import { layout } from '../layout';
import { PALETTE, FONT, css } from '../ui/theme';

export interface HudState {
  volume: number;
  goal: number;
  message?: string;
  won?: boolean;
}

/**
 * HUD, run in parallel with GameScene via scene.launch('UI').
 *
 * The readout is the point of the whole thing, so it gets the top of the
 * frame: volume large and centred, the target directly beneath it.
 */
export default class UIScene extends Phaser.Scene {
  private volumeLabel!: Phaser.GameObjects.Text;
  private goalLabel!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UI', active: false });
  }

  create(): void {
    const L = layout;
    const cx = L.W / 2;

    this.add.text(cx, L.u(30), 'VOLUME', {
      fontFamily: FONT, fontSize: L.font(17), color: css(PALETTE.inkSoft),
      fontStyle: '600',
    }).setOrigin(0.5, 0).setLetterSpacing(4).setResolution(2);

    this.volumeLabel = this.add.text(cx, L.u(48), '', {
      fontFamily: FONT, fontSize: L.font(72), color: css(PALETTE.ink),
      fontStyle: '700',
    }).setOrigin(0.5, 0).setResolution(2);

    this.goalLabel = this.add.text(cx, L.u(132), '', {
      fontFamily: FONT, fontSize: L.font(22), color: css(PALETTE.goal),
      fontStyle: '600',
    }).setOrigin(0.5, 0).setResolution(2);

    this.message = this.add.text(cx, L.u(196), '', {
      fontFamily: FONT, fontSize: L.font(26), color: css(PALETTE.ink),
      fontStyle: '600', align: 'center',
    }).setOrigin(0.5, 0).setAlpha(0).setResolution(2);

    const game = this.scene.get('Game') as Phaser.Scene & { hudState(): HudState };
    game.events.on('hud', (s: HudState) => this.render(s));
    this.render(game.hudState());   // seed, since create() order is not guaranteed
  }

  private render(s: HudState): void {
    this.volumeLabel.setText(`${fmt(s.volume)}%`);
    this.goalLabel.setText(`GOAL  ${fmt(s.goal)}%`);

    if (!s.message) return;

    this.message
      .setText(s.message)
      .setColor(css(s.won ? PALETTE.win : PALETTE.ink))
      .setAlpha(1);

    this.tweens.killTweensOf(this.message);
    if (s.won) return;   // the final message stays up

    this.tweens.add({
      targets: this.message, alpha: 0, delay: 1000, duration: 480,
    });
  }
}
