import type { SoundEffect } from './types.js';

type OscType = OscillatorType;

class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private initialized = false;

  private ensure(): void {
    if (this.initialized) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.initialized = true;
  }

  private resume(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private noise(duration: number, vol: number, when: number = 0): void {
    if (!this.ctx || !this.master) return;
    const start = this.ctx.currentTime + when;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const n = this.ctx.createBufferSource();
    n.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + duration);
    n.connect(g);
    g.connect(this.master);
    n.start(start);
    n.stop(start + duration);
  }

  private envTone(freq1: number, freq2: number, type: OscType, duration: number, vol: number, when: number = 0): void {
    if (!this.ctx || !this.master) return;
    const start = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq1, start);
    o.frequency.linearRampToValueAtTime(freq2, start + duration);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(start);
    o.stop(start + duration);
  }

  play(effect: SoundEffect): void {
    this.resume();
    switch (effect.type) {
      case 'SHOT':
        this.shot(effect.volume);
        break;
      case 'IMPACT':
        this.impact(effect.volume);
        break;
      case 'WALL_BREAK':
        this.wallBreak(effect.volume);
        break;
      case 'GEM_PICKUP':
        this.gemPickup(effect.volume);
        break;
      case 'COUNTDOWN':
        this.countdown(effect.volume);
        break;
      case 'VICTORY':
        this.victory(effect.volume);
        break;
      case 'DEFEAT':
        this.defeat(effect.volume);
        break;
      case 'SUPER':
        this.superSfx(effect.volume);
        break;
    }
  }

  shot(vol: number, archetype: string = 'FIGHTER'): void {
    if (archetype === 'SHARPSHOOTER') {
      this.envTone(900, 1400, 'square', 0.06, vol * 0.35);
      this.envTone(1100, 1700, 'square', 0.06, vol * 0.25, 0.03);
    } else if (archetype === 'THROWER') {
      this.envTone(120, 220, 'sawtooth', 0.14, vol * 0.3);
      this.noise(0.1, vol * 0.2, 0.02);
    } else if (archetype === 'TANK') {
      this.envTone(60, 150, 'square', 0.12, vol * 0.4);
    } else {
      this.envTone(250, 400, 'square', 0.08, vol * 0.4);
      this.noise(0.06, vol * 0.25, 0.02);
    }
  }

  impact(vol: number): void {
    this.envTone(300, 100, 'sawtooth', 0.1, vol * 0.5);
    this.noise(0.08, vol * 0.3, 0.01);
  }

  wallBreak(vol: number): void {
    this.noise(0.25, vol * 0.5);
    this.envTone(150, 40, 'square', 0.2, vol * 0.4);
  }

  gemPickup(vol: number): void {
    this.envTone(1200, 1600, 'sine', 0.12, vol * 0.4);
    this.envTone(1600, 2200, 'sine', 0.12, vol * 0.35, 0.08);
  }

  countdown(vol: number): void {
    this.envTone(660, 660, 'square', 0.15, vol * 0.4);
  }

  victory(vol: number): void {
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => {
      this.envTone(f, f, 'sine', 0.25, vol * 0.35, i * 0.14);
    });
  }

  defeat(vol: number): void {
    this.envTone(220, 110, 'sawtooth', 0.6, vol * 0.5);
    this.envTone(150, 60, 'sawtooth', 0.6, vol * 0.4, 0.2);
  }

  superSfx(vol: number): void {
    this.noise(0.4, vol * 0.5);
    this.envTone(100, 800, 'sawtooth', 0.4, vol * 0.4);
    this.envTone(400, 1200, 'square', 0.3, vol * 0.35, 0.15);
  }
}

export const audio = new AudioSynth();

export function playSound(type: SoundEffect['type'], volume?: number, archetype?: string): void {
  if (type === 'SHOT' && archetype) {
    audio.shot(volume ?? 0.5, archetype);
  } else {
    audio.play({ type, volume: volume ?? 0.5 });
  }
}
