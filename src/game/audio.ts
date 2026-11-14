// Procedural Web Audio sound effects + dynamic driving arcade electronic BGM

const BASS_PATTERN_HZ = [
  110.0, 110.0, 220.0, 110.0, // A2, A2, A3, A2
  130.81, 130.81, 164.81, 130.81, // C3, C3, E3, C3
  146.83, 146.83, 220.0, 146.83, // D3, D3, A3, D3
  164.81, 164.81, 196.0, 164.81, // E3, E3, G3, E3
];

const LEAD_ARP_HZ = [
  440.0, 523.25, 659.25, 523.25, // Am
  440.0, 523.25, 659.25, 880.0,
  523.25, 659.25, 783.99, 659.25, // C
  587.33, 659.25, 880.0, 783.99,
  587.33, 698.46, 880.0, 698.46, // Dm
  587.33, 698.46, 880.0, 1046.5,
  659.25, 783.99, 987.77, 783.99, // Em / E tension
  659.25, 880.0, 987.77, 1174.66,
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  // Dynamic BGM sequencer state
  private musicPlaying = false;
  private musicPaused = false;
  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private speedRatio = 0; // 0..1 from 2.0/s to 8.0/s
  private nearDanger = false;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.015);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setTension(speedRatio: number, nearDanger: boolean): void {
    this.speedRatio = Math.max(0, Math.min(1, speedRatio));
    this.nearDanger = nearDanger;
  }

  private getCurrentBpm(): number {
    // Starts brisk at 120 BPM, accelerates smoothly to 156 BPM with speed, +14 BPM in danger zone
    const base = 120 + this.speedRatio * 36 + (this.nearDanger ? 14 : 0);
    return Math.min(172, base);
  }

  public startMusic(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.musicPlaying = true;
    this.musicPaused = false;
    this.currentStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.startScheduler();
  }

  public pauseMusic(): void {
    this.musicPaused = true;
    this.stopScheduler();
  }

  public resumeMusic(): void {
    if (!this.musicPlaying || !this.musicPaused) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.musicPaused = false;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.startScheduler();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    this.musicPaused = false;
    this.stopScheduler();
  }

  private startScheduler(): void {
    if (this.schedulerTimer !== null) return;
    this.schedulerTimer = window.setInterval(() => {
      this.scheduleAhead();
    }, 25);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.musicPlaying || this.musicPaused || this.muted) {
      // Keep clock synced while muted so unmuting resumes smoothly on beat
      if (this.ctx && this.musicPlaying && !this.musicPaused && this.muted) {
        const secondsPerStep = 60 / this.getCurrentBpm() / 4;
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
          this.nextNoteTime += secondsPerStep;
          this.currentStep = (this.currentStep + 1) % 32;
        }
      }
      return;
    }

    const lookahead = 0.11;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      const secondsPerStep = 60 / this.getCurrentBpm() / 4; // 16th note
      this.nextNoteTime += secondsPerStep;
      this.currentStep = (this.currentStep + 1) % 32;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;

    const ctx = this.ctx;
    const dest = this.musicGain;

    // 1. Punchy Four-on-the-Floor Kick (steps 0, 4, 8, 12, 16, 20, 24, 28)
    if (step % 4 === 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(132, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.085);

      gain.gain.setValueAtTime(0.32, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.12);
    }

    // 2. Crisp Offbeat Hi-Hat (steps 2, 6, 10, 14...) + extra tension 16ths when near danger
    const playHat = step % 4 === 2 || (this.nearDanger && step % 2 === 1);
    if (playHat && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6800, time);

      const gain = ctx.createGain();
      const amp = step % 4 === 2 ? 0.085 : 0.04;
      gain.gain.setValueAtTime(amp, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.038);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      src.start(time);
      src.stop(time + 0.042);
    }

    // 3. Driving 16th-Note Synth Bass Pulse
    const bassFreq = BASS_PATTERN_HZ[Math.floor(step / 2) % BASS_PATTERN_HZ.length];
    if (step % 2 === 0 || this.speedRatio > 0.35) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(step % 2 === 1 ? bassFreq * 2 : bassFreq, time);

      const cutoff = 520 + this.speedRatio * 680 + (this.nearDanger ? 450 : 0);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(160, time + 0.09);

      const bassGain = step % 2 === 0 ? 0.14 : 0.075;
      gain.gain.setValueAtTime(bassGain, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.095);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.1);
    }

    // 4. Urgent Arcade Arpeggio Lead
    const arpFreq = LEAD_ARP_HZ[step % LEAD_ARP_HZ.length];
    {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = this.nearDanger ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(arpFreq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400 + this.speedRatio * 1800, time);

      const accent = step % 4 === 0 ? 0.095 : 0.055;
      gain.gain.setValueAtTime(accent, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.105);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.11);
    }
  }

  public playMove(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playRotate(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.055);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playDropWhoosh(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.085);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playLand(stackRatio = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = 125 + stackRatio * 45;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.085);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playLineClear(lines: number, combo: number, isMagic = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const baseNotes = isMagic
      ? [587.33, 739.99, 880.0, 1174.66, 1479.98]
      : [523.25, 659.25, 783.99, 1046.5];
    const semitoneBoost = Math.min(combo - 1, 6);
    const pitchMult = Math.pow(2, semitoneBoost / 12);

    const count = Math.min(lines + 1, baseNotes.length);
    for (let i = 0; i < count; i++) {
      const start = now + i * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isMagic ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseNotes[i] * pitchMult, start);

      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.27);
    }
  }

  public playSpeedUp(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const start = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  public playWarning(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.setValueAtTime(540, now + 0.07);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}
