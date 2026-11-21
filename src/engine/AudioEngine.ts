import type { SoundName } from '../types/game.ts';

interface Tone {
  frequency: number;
  endFrequency?: number;
  duration: number;
  volume: number;
  delay?: number;
  type?: OscillatorType;
}

interface Cue {
  interval: number;
  priority: number;
  tones: readonly Tone[];
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
  priority: number;
  start: number;
}

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

const MASTER_VOLUME = 0.14;
const MAX_VOICES = 12;
const FLOOR = 0.0001;
const CUES: Record<SoundName, Cue> = {
  intro: {
    interval: 1,
    priority: 3,
    tones: [
      { frequency: 82.41, endFrequency: 80, duration: 0.65, volume: 0.16, type: 'sawtooth' },
      { frequency: 123.47, duration: 0.58, volume: 0.075, delay: 0.018, type: 'sawtooth' },
      { frequency: 164.81, duration: 0.52, volume: 0.06, delay: 0.035, type: 'sawtooth' },
      { frequency: 659.25, endFrequency: 329.63, duration: 0.3, volume: 0.04, delay: 0.05, type: 'triangle' },
    ],
  },
  parry: {
    interval: 0.12,
    priority: 3,
    tones: [
      { frequency: 1760, endFrequency: 1320, duration: 0.2, volume: 0.13, type: 'sine' },
      { frequency: 2640, duration: 0.08, volume: 0.06, type: 'triangle' },
    ],
  },
  dash: {
    interval: 0.4,
    priority: 2,
    tones: [
      { frequency: 620, endFrequency: 110, duration: 0.3, volume: 0.12, type: 'triangle' },
      { frequency: 180, endFrequency: 420, duration: 0.2, volume: 0.07, delay: 0.1 },
    ],
  },
  shoot: {
    interval: 0.055,
    priority: 0,
    tones: [{ frequency: 1180, endFrequency: 420, duration: 0.065, volume: 0.11, type: 'triangle' }],
  },
  hit: {
    interval: 0.045,
    priority: 0,
    tones: [{ frequency: 210, endFrequency: 85, duration: 0.055, volume: 0.055, type: 'square' }],
  },
  pickup: {
    interval: 0.085,
    priority: 1,
    tones: [
      { frequency: 740, endFrequency: 990, duration: 0.085, volume: 0.1 },
      { frequency: 1480, duration: 0.065, volume: 0.045, delay: 0.035 },
    ],
  },
  hurt: {
    interval: 0.22,
    priority: 2,
    tones: [
      { frequency: 145, endFrequency: 51, duration: 0.2, volume: 0.095, type: 'triangle' },
      { frequency: 76, endFrequency: 40, duration: 0.22, volume: 0.17 },
    ],
  },
  upgrade: {
    interval: 0.4,
    priority: 2,
    tones: [
      { frequency: 392, duration: 0.16, volume: 0.11, type: 'triangle' },
      { frequency: 493.88, duration: 0.16, volume: 0.1, delay: 0.075, type: 'triangle' },
      { frequency: 587.33, duration: 0.18, volume: 0.1, delay: 0.15, type: 'triangle' },
      { frequency: 783.99, duration: 0.28, volume: 0.1, delay: 0.225 },
    ],
  },
  summon: {
    interval: 0.75,
    priority: 3,
    tones: [
      { frequency: 195, endFrequency: 38, duration: 0.62, volume: 0.24, type: 'triangle' },
      { frequency: 220, duration: 0.16, volume: 0.085, delay: 0.10, type: 'triangle' },
      { frequency: 329.63, duration: 0.16, volume: 0.085, delay: 0.17, type: 'triangle' },
      { frequency: 440, duration: 0.17, volume: 0.08, delay: 0.24, type: 'triangle' },
      { frequency: 659.25, duration: 0.18, volume: 0.075, delay: 0.31, type: 'triangle' },
      { frequency: 880, duration: 0.3, volume: 0.07, delay: 0.38 },
    ],
  },
  alarm: {
    interval: 1.1,
    priority: 3,
    tones: [
      { frequency: 440, endFrequency: 880, duration: 0.22, volume: 0.12, type: 'triangle' },
      { frequency: 880, endFrequency: 440, duration: 0.24, volume: 0.12, delay: 0.22, type: 'triangle' },
      { frequency: 440, endFrequency: 880, duration: 0.22, volume: 0.1, delay: 0.46, type: 'triangle' },
      { frequency: 880, endFrequency: 330, duration: 0.3, volume: 0.1, delay: 0.68, type: 'triangle' },
      { frequency: 110, endFrequency: 82, duration: 0.8, volume: 0.065, type: 'sawtooth' },
    ],
  },
  blackflash: {
    interval: 1,
    // The finishing impact may steal any gameplay voice, but still obeys MAX_VOICES.
    priority: 5,
    tones: [
      { frequency: 2400, endFrequency: 90, duration: 0.09, volume: 0.15, type: 'sawtooth' },
      { frequency: 780, endFrequency: 44, duration: 0.17, volume: 0.15, type: 'square' },
      { frequency: 132, endFrequency: 28, duration: 0.38, volume: 0.28, delay: 0.012 },
      { frequency: 3400, endFrequency: 180, duration: 0.065, volume: 0.07, delay: 0.025, type: 'triangle' },
      { frequency: 76, endFrequency: 25, duration: 0.32, volume: 0.13, delay: 0.055, type: 'triangle' },
    ],
  },
  victory: {
    interval: 1.2,
    priority: 4,
    tones: [
      { frequency: 523.25, duration: 0.23, volume: 0.1, type: 'triangle' },
      { frequency: 659.25, duration: 0.23, volume: 0.1, delay: 0.11, type: 'triangle' },
      { frequency: 783.99, duration: 0.25, volume: 0.1, delay: 0.22, type: 'triangle' },
      { frequency: 1046.5, duration: 0.55, volume: 0.1, delay: 0.34 },
      { frequency: 261.63, duration: 0.5, volume: 0.11, delay: 0.34 },
    ],
  },
  defeat: {
    interval: 1.2,
    priority: 4,
    tones: [
      { frequency: 261.63, duration: 0.23, volume: 0.09, type: 'triangle' },
      { frequency: 196, duration: 0.25, volume: 0.09, delay: 0.15, type: 'triangle' },
      { frequency: 130.81, endFrequency: 65.4, duration: 0.5, volume: 0.1, delay: 0.32, type: 'triangle' },
      { frequency: 77, endFrequency: 38, duration: 0.55, volume: 0.13, delay: 0.16 },
    ],
  },
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Set<Voice>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;
  private disposed = false;

  unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    let createdContext: AudioContext | null = null;
    let createdMaster: GainNode | null = null;
    try {
      if (this.context?.state === 'closed') {
        for (const voice of this.voices) this.releaseVoice(voice);
        this.master?.disconnect();
        this.context = null;
        this.master = null;
        this.lastPlayed.clear();
      }
      if (!this.context) {
        const audioWindow = window as AudioWindow;
        const Context = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
        if (!Context) return;
        createdContext = new Context();
        createdMaster = createdContext.createGain();
        createdMaster.gain.value = this.muted ? 0 : MASTER_VOLUME;
        createdMaster.connect(createdContext.destination);
        this.context = createdContext;
        this.master = createdMaster;
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    } catch {
      if (createdContext && this.context !== createdContext) {
        try { createdMaster?.disconnect(); } catch {}
        try { void createdContext.close().catch(() => {}); } catch {}
      }
    }
  }

  setMuted(muted: boolean): void {
    if (this.disposed || this.muted === muted) return;
    this.muted = muted;
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state === 'closed') return;
    try {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOLUME, now + 0.015);
      if (muted) {
        for (const voice of this.voices) {
          if (context.state !== 'running') {
            this.releaseVoice(voice);
            continue;
          }
          try {
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setTargetAtTime(FLOOR, now, 0.004);
            voice.oscillator.stop(now + 0.016);
          } catch {
            this.releaseVoice(voice);
          }
        }
        this.lastPlayed.clear();
      }
    } catch {
      if (muted) for (const voice of this.voices) this.releaseVoice(voice);
    }
  }

  play(name: SoundName): void {
    const context = this.context;
    if (this.disposed || this.muted || !context || !this.master || context.state !== 'running') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const cue = CUES[name];
    if (!cue) return;
    const now = context.currentTime;
    const previous = this.lastPlayed.get(name);
    if (previous !== undefined && now - previous < cue.interval) return;
    this.lastPlayed.set(name, now);
    for (const tone of cue.tones) this.startTone(context, tone, cue.priority, now);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of this.voices) this.releaseVoice(voice);
    this.lastPlayed.clear();
    const context = this.context;
    try { this.master?.disconnect(); } catch {}
    this.master = null;
    this.context = null;
    if (context && context.state !== 'closed') {
      try { void context.close().catch(() => {}); } catch {}
    }
  }

  private startTone(context: AudioContext, tone: Tone, priority: number, now: number): void {
    if (!this.master) return;
    if (this.voices.size >= MAX_VOICES) {
      let candidate: Voice | null = null;
      for (const voice of this.voices) {
        if (voice.priority > priority) continue;
        if (!candidate || voice.priority < candidate.priority
          || (voice.priority === candidate.priority && voice.start < candidate.start)) candidate = voice;
      }
      if (!candidate) return;
      this.releaseVoice(candidate);
    }
    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    let voice: Voice | null = null;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      const start = now + (tone.delay ?? 0);
      const end = start + tone.duration;
      const attack = Math.min(0.008, tone.duration * 0.12);
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(FLOOR, start);
      gain.gain.linearRampToValueAtTime(tone.volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(FLOOR, end);
      oscillator.connect(gain);
      gain.connect(this.master);
      const activeVoice: Voice = { oscillator, gain, priority, start };
      voice = activeVoice;
      this.voices.add(activeVoice);
      oscillator.onended = () => this.releaseVoice(activeVoice, false);
      oscillator.start(start);
      oscillator.stop(end + 0.012);
    } catch {
      if (voice) this.releaseVoice(voice);
      else {
        try { oscillator?.stop(); } catch {}
        try { oscillator?.disconnect(); } catch {}
        try { gain?.disconnect(); } catch {}
      }
    }
  }

  private releaseVoice(voice: Voice, stop = true): void {
    if (!this.voices.delete(voice)) return;
    voice.oscillator.onended = null;
    if (stop) {
      try { voice.oscillator.stop(); } catch {}
    }
    try { voice.oscillator.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
  }
}
