import Phaser from 'phaser';
import { fmt, round2 } from '../config';
import { layout } from '../layout';
import { PALETTE, FONT, css } from '../ui/theme';

/**
 * The slider track: a static Matter body birds land on, drawn in the same
 * cartoon language as the sprites - heavy ink outline, warm fill, rounded caps.
 */
export default class SliderBar {
  readonly body: MatterJS.BodyType;

  private readonly scene: Phaser.Scene;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly track: Phaser.GameObjects.Graphics;
  /** Off-list shape driving the sheen's geometry mask. */
  private readonly fillShape: Phaser.GameObjects.Graphics;
  private readonly sheen: Phaser.GameObjects.Graphics;
  private readonly ticks: Phaser.GameObjects.Graphics;
  private readonly flag: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Graphics;
  private readonly goalLabel: Phaser.GameObjects.Text;

  volume: number;
  private goal: number | null = null;

  constructor(scene: Phaser.Scene, volume = 0) {
    const L = layout;
    this.scene = scene;
    this.volume = volume;

    this.body = scene.matter.add.rectangle(
      (L.barDrawLeft + L.barDrawRight) / 2, L.barCenterY, L.barDrawSpan, L.barHeight,
      { isStatic: true, label: 'bar', friction: 1, restitution: 0 },
    );

    this.shadow = scene.add.graphics().setDepth(40);
    this.track = scene.add.graphics().setDepth(50);

    // The sheen is a plain rect clipped to the fill's pill outline. Drawing it
    // as its own rounded rect cannot work: its corner radius would have to
    // exceed its half-height at the caps, which renders as a chewed notch.
    this.fillShape = scene.make.graphics({}, false);
    this.sheen = scene.add.graphics().setDepth(51);
    this.sheen.setMask(this.fillShape.createGeometryMask());

    this.ticks = scene.add.graphics().setDepth(52);
    this.flag = scene.add.graphics().setDepth(60);
    this.knob = scene.add.graphics().setDepth(70);

    // The labels now fall on the dark soil below the track, so they flip to
    // cream with a dark halo instead of ink with a light one.
    const endStyle = {
      fontFamily: FONT, fontSize: L.font(15), color: css(PALETTE.knobFace),
    };
    [
      scene.add.text(L.barLeft, L.barCenterY + L.u(26), '0', endStyle)
        .setOrigin(0.5, 0).setDepth(50).setResolution(2)
        .setShadow(0, L.u(1), '#00000099', L.u(4)),
      scene.add.text(L.barRight, L.barCenterY + L.u(26), '100', endStyle)
        .setOrigin(0.5, 0).setDepth(50).setResolution(2)
        .setShadow(0, L.u(1), '#00000099', L.u(4)),
    ];

    this.goalLabel = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: L.font(14), color: css(PALETTE.goal),
      fontStyle: '600',
    }).setOrigin(0.5, 1).setDepth(60).setVisible(false).setResolution(2);

    this.drawStatic();
    this.draw();
  }

  setVolume(volume: number): number {
    this.volume = round2(Phaser.Math.Clamp(volume, 0, 100));
    this.draw();
    return this.volume;
  }

  /** Mark the target on the track so the player can aim at it. */
  setGoal(goal: number | null): void {
    this.goal = goal;
    this.drawGoal();
  }

  /** Pulse the knob so a freshly committed value is obvious. */
  flash(): void {
    this.scene.tweens.addCounter({
      from: 1.85, to: 1, duration: 460, ease: 'Back.easeOut',
      onUpdate: (t) => this.draw(t.getValue() ?? 1),
    });
  }

  // --- rendering -----------------------------------------------------------

  private drawStatic(): void {
    const L = layout;
    const r = L.barHeight / 2;
    this.shadow.clear();
    this.shadow.fillStyle(PALETTE.shadow, 0.13);
    this.shadow.fillRoundedRect(
      L.barDrawLeft + L.u(3), L.barCenterY - L.barHeight / 2 + L.u(7),
      L.barDrawSpan, L.barHeight, r,
    );
  }

  private draw(knobScale = 1): void {
    const L = layout;
    const x = L.volumeToX(this.volume);
    const top = L.barCenterY - L.barHeight / 2;
    const r = L.barHeight / 2;
    const outline = L.u(4);
    const g = this.track;

    g.clear();

    // Trough: ink outline, then the recessed face.
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(
      L.barDrawLeft - outline, top - outline,
      L.barDrawSpan + outline * 2, L.barHeight + outline * 2, r + outline,
    );
    g.fillStyle(PALETTE.trackBg, 1);
    g.fillRoundedRect(L.barDrawLeft, top, L.barDrawSpan, L.barHeight, r);

    // Fill. The right cap stays square until the value actually reaches the
    // end, otherwise a rounded cap bulges out of the trough mid-track.
    // Starts at the drawn edge, not the value edge, so the fill's left cap is
    // the trough's own cap rather than a second curve inside it.
    const atEnd = this.volume >= 99.99;
    const fillRight = atEnd ? L.barDrawRight : x;
    const w = fillRight - L.barDrawLeft;

    this.fillShape.clear();
    this.sheen.clear();

    if (this.volume > 0.001 && w > 0.5) {
      const capR = Math.min(r, w / 2);
      const radii = { tl: capR, bl: capR, tr: atEnd ? capR : 0, br: atEnd ? capR : 0 };

      g.fillStyle(PALETTE.fillBottom, 1);
      g.fillRoundedRect(L.barDrawLeft, top, w, L.barHeight, radii);

      // Same pill into the mask, then a flat band through it.
      this.fillShape.fillStyle(0xffffff, 1);
      this.fillShape.fillRoundedRect(L.barDrawLeft, top, w, L.barHeight, radii);
      this.sheen.fillStyle(PALETTE.fillTop, 1);
      this.sheen.fillRect(L.barDrawLeft, top, w, L.barHeight * 0.52);
    }

    this.drawTicks(top);
    this.drawKnob(x, knobScale);
  }

  /** Every 10%, over the fill so they read on either side. */
  private drawTicks(top: number): void {
    const L = layout;
    const g = this.ticks;
    g.clear();
    for (let p = 10; p < 100; p += 10) {
      const tx = L.volumeToX(p);
      const major = p === 50;
      g.fillStyle(PALETTE.ink, major ? 0.3 : 0.14);
      g.fillRect(
        tx - L.u(1), top + (major ? L.u(3) : L.u(5)),
        L.u(2), L.barHeight - (major ? L.u(6) : L.u(10)),
      );
    }
  }

  /**
   * Centred in the track, not on its top edge: a landed bird rests on the top
   * edge, and the two were drawing over each other.
   */
  private drawKnob(x: number, scale: number): void {
    const L = layout;
    const r = L.knobRadius * scale;
    const cy = L.barCenterY;
    const g = this.knob;
    g.clear();
    g.fillStyle(PALETTE.shadow, 0.18);
    g.fillCircle(x, cy + L.u(1.5), r);
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(x, cy, r);
    g.fillStyle(PALETTE.knobFace, 1);
    g.fillCircle(x, cy, r - L.u(2.5));
    g.fillStyle(PALETTE.fillBottom, 1);
    g.fillCircle(x, cy, r * 0.38);
  }

  private drawGoal(): void {
    const L = layout;
    const g = this.flag;
    g.clear();

    if (this.goal === null) {
      this.goalLabel.setVisible(false);
      return;
    }

    const gx = L.volumeToX(this.goal);
    const poleTop = L.barCenterY - L.barHeight / 2 - L.u(54);
    const poleBottom = L.barCenterY + L.barHeight / 2 + L.u(4);

    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(gx - L.u(1.5), poleTop, L.u(3), poleBottom - poleTop);

    g.fillStyle(PALETTE.goal, 1);
    g.fillTriangle(
      gx + L.u(1.5), poleTop,
      gx + L.u(30), poleTop + L.u(9),
      gx + L.u(1.5), poleTop + L.u(18),
    );
    g.lineStyle(L.u(2.5), PALETTE.ink, 1);
    g.beginPath();
    g.moveTo(gx + L.u(1.5), poleTop);
    g.lineTo(gx + L.u(30), poleTop + L.u(9));
    g.lineTo(gx + L.u(1.5), poleTop + L.u(18));
    g.strokePath();

    this.goalLabel
      .setText(`${fmt(this.goal)}%`)
      .setPosition(gx, poleTop - L.u(6))
      .setVisible(true);
  }
}
