/* ============================================================
   ARENA BRAWLER — Sintetizador de efeitos sonoros procedural
   via Web Audio API (sem arquivos externos).
   ============================================================ */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;

  /** Deve ser chamado no primeiro gesto do usuário (política de autoplay). */
  unlock(): void {
    if (!this.ctx) {
      type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as WindowWithWebkit;
      const AC = window.AudioContext ?? w.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 1.2);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.02);
    }
  }

  /* ---------------- Primitivas ---------------- */

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    when = 0,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(
    dur: number,
    gain: number,
    f0: number,
    f1: number,
    when = 0,
    q = 1,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(40, f0), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---------------- Tiros ---------------- */

  shoot(archetype: string): void {
    switch (archetype) {
      case 'scarlet': // escopeta: estouro de ruído grave
        this.noise(0.14, 0.5, 1800, 220, 0, 1.2);
        this.tone('square', 260, 90, 0.1, 0.16);
        break;
      case 'hawk': // sniper: zape seco e agudo
        this.tone('square', 1300, 320, 0.09, 0.2);
        this.noise(0.05, 0.18, 4200, 900);
        break;
      case 'fuse': // lançador: thump abafado
        this.tone('sine', 320, 110, 0.12, 0.3);
        this.noise(0.06, 0.12, 900, 300);
        break;
      case 'bruto': // tanque: soco grave
        this.tone('sawtooth', 220, 70, 0.11, 0.22);
        this.noise(0.08, 0.2, 700, 180);
        break;
      default:
        this.tone('square', 800, 250, 0.08, 0.18);
        break;
    }
  }

  shootSuper(): void {
    this.noise(0.3, 0.5, 2600, 260, 0, 1);
    this.tone('sawtooth', 520, 90, 0.28, 0.24);
    this.tone('square', 900, 180, 0.22, 0.14, 0.02);
    this.tone('sine', 180, 55, 0.3, 0.3);
  }

  explosion(): void {
    this.noise(0.34, 0.55, 1200, 90);
    this.tone('sine', 140, 38, 0.32, 0.4);
    this.tone('triangle', 220, 60, 0.2, 0.18);
  }

  wallBreak(): void {
    this.noise(0.2, 0.4, 700, 160);
    this.tone('square', 190, 60, 0.14, 0.16);
  }

  hit(): void {
    this.tone('square', 420, 180, 0.055, 0.14);
    this.noise(0.04, 0.12, 1600, 500);
  }

  land(): void {
    this.noise(0.22, 0.5, 500, 90);
    this.tone('sine', 120, 40, 0.22, 0.4);
  }

  leap(): void {
    this.noise(0.28, 0.22, 300, 2200, 0, 2);
    this.tone('triangle', 180, 620, 0.26, 0.16);
  }

  /* ---------------- Coleta / UI ---------------- */

  gemPickup(): void {
    this.tone('triangle', 660, 660, 0.07, 0.2);
    this.tone('triangle', 990, 990, 0.09, 0.2, 0.07);
    this.tone('triangle', 1320, 1320, 0.1, 0.16, 0.15);
  }

  cubePickup(): void {
    this.tone('sawtooth', 300, 640, 0.14, 0.16);
    this.tone('triangle', 640, 980, 0.12, 0.16, 0.09);
  }

  countdownTick(finalTick: boolean): void {
    if (finalTick) {
      this.tone('square', 1320, 1320, 0.16, 0.22);
      this.tone('square', 1760, 1760, 0.2, 0.18, 0.1);
    } else {
      this.tone('square', 880, 880, 0.1, 0.18);
    }
  }

  uiClick(): void {
    this.tone('triangle', 700, 900, 0.05, 0.14);
  }

  victory(): void {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this.tone('triangle', f, f, 0.22, 0.22, i * 0.13);
      this.tone('square', f / 2, f / 2, 0.18, 0.09, i * 0.13);
    });
    this.tone('triangle', 1568, 1568, 0.5, 0.2, 0.68);
  }

  defeat(): void {
    const notes = [440, 415, 370, 311, 262];
    notes.forEach((f, i) => {
      this.tone('sawtooth', f, f * 0.98, 0.3, 0.16, i * 0.18);
    });
    this.tone('sine', 130, 65, 0.8, 0.22, 0.9);
  }
}
