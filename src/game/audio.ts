import { rewardNotes, type RewardNote } from './rewardSounds';
import type { RewardNotice } from './rewardFeedback';
import type { GameEvent, GameState } from './types';

type Voice = { oscillator: OscillatorNode; gain: GainNode; reward: boolean };

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private work: GainNode | null = null;
  private voices = new Set<Voice>();
  private cooldowns = new Map<string, number>();
  private volume = .5;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  unlock(): void {
    if (!this.context) {
      try {
        const context = this.createContext();
        const master = context.createGain(); const work = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 6; limiter.ratio.value = 12;
        limiter.attack.value = .003; limiter.release.value = .12;
        master.gain.value = this.volume;
        work.connect(master); master.connect(limiter); limiter.connect(context.destination);
        this.context = context; this.master = master; this.work = work;
      } catch { return; }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .015);
  }

  /** Invoked only when the renderer actually starts (or clears) the selected notice. */
  playReward(notice: RewardNotice | null): void {
    const context = this.context;
    if (!context || !this.work) return;
    this.stopVoices(true);
    const now = context.currentTime;
    this.work.gain.cancelScheduledValues(now);
    this.work.gain.setValueAtTime(1, now);
    if (!notice || this.volume === 0 || context.state !== 'running') return;
    if (notice.priority >= 3) {
      this.work.gain.linearRampToValueAtTime(notice.effect === 'anomaly' ? .12 : .35, now + .025);
      this.work.gain.setValueAtTime(notice.effect === 'anomaly' ? .12 : .35, now + .32);
      this.work.gain.linearRampToValueAtTime(1, now + .62);
    }
    for (const note of rewardNotes(notice)) this.tone(note, true);
  }

  handle(event: GameEvent, state?: GameState): void {
    if (!this.context || this.context.state !== 'running' || this.volume === 0) return;
    const localWork = ['MINER_SWING_HIT', 'NODE_BREAK', 'PORTER_PICKUP', 'PORTER_DEPOSIT'].includes(event.type);
    if (localWork && state && (state.run.elevator.travel || (event.data?.depth && event.data.depth !== state.run.depth.current))) return;
    const automated = Boolean(event.data?.crewId || event.data?.boreId);
    if (localWork) {
      const key = `${event.type}:${automated ? 'auto' : 'player'}`;
      const now = this.context.currentTime;
      if (now < (this.cooldowns.get(key) ?? 0)) return;
      this.cooldowns.set(key, now + (automated ? .12 : .045));
    }
    if (event.type === 'MINER_SWING_HIT') {
      const damage = event.data?.damage;
      if (typeof damage !== 'number' || !Number.isFinite(damage) || damage <= 0) return;
      this.tone({ at: 0, frequency: 118, end: 75, duration: .045, type: 'triangle', gain: automated ? .024 : .055 });
    }
    if (event.type === 'NODE_BREAK') {
      this.tone({ at: 0, frequency: 165, end: 55, duration: .12, type: 'triangle', gain: automated ? .04 : .085 });
      this.tone({ at: .035, frequency: 310, end: 130, duration: .075, type: 'square', gain: .015 });
    }
    if (event.type === 'PORTER_PICKUP') this.sequence([250], .035, .015);
    if (event.type === 'PORTER_DEPOSIT') this.sequence([330], .045, .018);
    if (event.type === 'ELEVATOR_DEPART') this.sequence([520, 390], .05, .035);
    if (event.type === 'ELEVATOR_ARRIVE_SURFACE') this.sequence([330, 520], .055, .035);
    if (event.type === 'DATA_GAIN') this.sequence([392, 494, 587], .05, .025);
    if (event.type === 'RESEARCH_COMPLETED') this.sequence([440, 587, 740], .07, .026);
    if (event.type === 'CORE_CHARGE_GAINED') this.sequence([147, 196, 247], .09, .03);
    if (event.type === 'REBOOT_COMMITTED') { this.reset(); this.sequence([147, 110, 82], .12, .04); }
    if (event.type === 'CORE_PROTOCOL_PURCHASED') this.sequence([330, 440, 523], .07, .026);
    if (event.type === 'DEPTH_ENTERED') this.sequence([220, 196, 165], .1, .025);
  }

  reset(): void {
    this.stopVoices(); this.cooldowns.clear();
    if (this.context && this.work) {
      this.work.gain.cancelScheduledValues(this.context.currentTime);
      this.work.gain.setValueAtTime(1, this.context.currentTime);
    }
  }

  private stopVoices(rewardOnly = false): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (rewardOnly && !voice.reward) continue;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(.0001, now, .006);
      voice.oscillator.stop(now + .025);
      this.voices.delete(voice);
    }
  }

  private sequence(frequencies: number[], duration: number, gain: number): void {
    frequencies.forEach((frequency, index) => this.tone({ at: index * duration * .8, frequency, duration, type: 'square', gain }));
  }

  private tone(note: RewardNote, reward = false): void {
    const context = this.context; const output = reward ? this.master : this.work;
    if (!context || !output || this.voices.size >= 24) return;
    const oscillator = context.createOscillator(); const gain = context.createGain();
    const start = context.currentTime + note.at;
    oscillator.type = note.type; oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.end) oscillator.frequency.exponentialRampToValueAtTime(note.end, start + note.duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(note.gain, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, start + note.duration);
    oscillator.connect(gain); gain.connect(output);
    const voice = { oscillator, gain, reward }; this.voices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    oscillator.start(start); oscillator.stop(start + note.duration + .01);
  }
}
