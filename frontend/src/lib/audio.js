let context;
let enabled = false;
let volume = 0.3;
export const audio = {
  configure(settings) { enabled = Boolean(settings.sound); volume = Math.max(0, Math.min(1, settings.volume ?? 0.3)); },
  async unlock() {
    if (!enabled) return;
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') await context.resume();
    } catch { /* Sound is an enhancement, never a prerequisite to play. */ }
  },
  play(type) {
    if (!enabled || !context || context.state !== 'running') return;
    const patterns = {
      click: [[520, 0, 0.045, 'sine', 0.22]],
      join: [[320, 0, 0.12], [480, 0.08, 0.16]],
      success: [[440, 0, 0.13], [554, 0.1, 0.16], [660, 0.2, 0.28]],
      start: [[220, 0, 0.2], [330, 0.2, 0.2], [440, 0.4, 0.35]],
      meeting: [[660, 0, 0.16, 'triangle'], [440, 0.2, 0.18, 'triangle'], [660, 0.45, 0.22, 'triangle']],
      kill: [[120, 0, 0.22, 'sawtooth', 0.18], [58, 0.06, 0.3, 'triangle', 0.5]],
      ejection: [[330, 0, 0.3], [246, 0.25, 0.3], [164, 0.5, 0.7]],
      foot: [[90, 0, 0.025, 'sine', 0.06]],
    };
    const now = context.currentTime;
    for (const [frequency, delay, duration, shape = 'sine', level = 0.3] of patterns[type] || patterns.click) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.8), now + delay + duration);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * volume * 0.2), now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    }
  },
};
