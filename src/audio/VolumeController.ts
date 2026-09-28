import { VOLUME_RAMP_S, DEFAULT_VOLUME, round2 } from '../config';
import { THEME_URL, SFX_FLY_URL } from '../assets';

/**
 * Owns the Web Audio graph:
 *
 *   <audio loop theme.mp3> -> MediaElementSource -\
 *                                                  -> musicGain -> destination
 *              (fallback oscillators) ------------/
 *
 *   sfx one-shots -> sfxGain -> destination     (deliberately NOT muted at 0%,
 *                                                so the game still feels alive)
 *
 * If no theme file is present a looping arpeggio is synthesised instead, so the
 * volume change is audible on a fresh clone with zero assets.
 */
export default class VolumeController {
  readonly ctx: AudioContext;
  readonly musicGain: GainNode;
  readonly sfxGain: GainNode;

  volume: number = DEFAULT_VOLUME;
  usingFallback = false;

  private el: HTMLAudioElement | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sfx = new Map<string, AudioBuffer>();

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = DEFAULT_VOLUME / 100;
    this.musicGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.ctx.destination);

    // decodeAudioData works on a suspended context, so this can start now and
    // be ready by the time the first shot is fired.
    void this.loadSfx('fly', SFX_FLY_URL);
  }

  /** One-shots live outside the music gain, so 0% volume does not mute them. */
  private async loadSfx(name: string, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      this.sfx.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      console.info(`[audio] optional sfx "${name}" not loaded from ${url}`);
    }
  }

  /** Dev probe: is the graph live and the clip decoded? */
  status(): { ctx: AudioContextState; sfx: string[]; volume: number; fallback: boolean } {
    return {
      ctx: this.ctx.state, sfx: [...this.sfx.keys()],
      volume: this.volume, fallback: this.usingFallback,
    };
  }

  playSfx(name: string, volume = 1): void {
    const buf = this.sfx.get(name);
    if (!buf || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Must be called from a user-gesture handler. */
  async unlock(themeUrl: string = THEME_URL): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.el || this.usingFallback) return;

    try {
      const res = await fetch(themeUrl, { method: 'HEAD' });
      if (!res.ok) throw new Error(`theme ${res.status}`);

      const el = new Audio(themeUrl);
      el.loop = true;
      el.crossOrigin = 'anonymous';
      this.ctx.createMediaElementSource(el).connect(this.musicGain);
      await el.play();
      this.el = el;
    } catch {
      this.startFallback();
    }
  }

  /** Simple looping arpeggio so there is always something to hear. */
  private startFallback(): void {
    this.usingFallback = true;
    console.info(
      '[audio] no public/assets/audio/theme.mp3 found - using synthesised ' +
      'fallback loop. Drop an mp3 there to replace it.',
    );

    const notes = [329.63, 392.0, 493.88, 587.33, 493.88, 392.0];
    const step = 0.28;
    const bed = this.ctx.createGain();
    bed.gain.value = 0.22;
    bed.connect(this.musicGain);

    const schedule = (startAt: number): void => {
      notes.forEach((freq, i) => {
        const t = startAt + i * step;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(1, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + step * 0.9);
        osc.connect(env).connect(bed);
        osc.start(t);
        osc.stop(t + step);
      });
    };

    const loopLen = notes.length * step;
    let next = this.ctx.currentTime + 0.1;
    schedule(next);
    this.fallbackTimer = setInterval(() => {
      next += loopLen;
      schedule(next);
    }, loopLen * 1000);
  }

  /** 0.00..100.00, ramped so it does not click. */
  setVolume(volume: number): number {
    this.volume = round2(Math.max(0, Math.min(100, volume)));
    const g = this.musicGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.volume / 100, now + VOLUME_RAMP_S);
    return this.volume;
  }

  destroy(): void {
    if (this.fallbackTimer !== null) clearInterval(this.fallbackTimer);
    this.el?.pause();
    void this.ctx.close();
  }
}

/**
 * Module singleton. The AudioContext is constructed lazily on first access so
 * it is never created during module evaluation, and resume() must happen
 * inside the user-gesture handler (see BootScene) rather than in a scene's
 * create(), which Phaser defers to the next frame.
 */
let instance: VolumeController | null = null;

export function getAudio(): VolumeController {
  if (!instance) instance = new VolumeController();
  return instance;
}
