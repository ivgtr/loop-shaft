import { rewardNotice } from './rewardFeedback';
import type { GameEvent } from './types';

export class GameAudio {
  private context: AudioContext | null = null;
  private rewardSoundUntil = 0;
  private rewardPriority = 0;

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  handle(event: GameEvent): void {
    if (!this.context) return;
    if (event.type === 'MINER_SWING_HIT') this.tone(118, 0.055, 'square', 0.045);
    if (event.type === 'PORTER_PICKUP') this.tone(250, 0.035, 'square', 0.015);
    if (event.type === 'PORTER_DEPOSIT') this.tone(330, 0.045, 'square', 0.018);
    if (event.type === 'ELEVATOR_DEPART') this.sequence([520, 390], 0.05, 0.035);
    if (event.type === 'ELEVATOR_ARRIVE_SURFACE') this.sequence([330, 520], 0.055, 0.035);
    if (event.type === 'DATA_GAIN') this.sequence([392, 494, 587], 0.05, 0.025);
    if (event.type === 'RESEARCH_COMPLETED') this.sequence([440, 587, 740], 0.07, 0.026);
    if (event.type === 'CORE_CHARGE_GAINED') this.sequence([147, 196, 247], 0.09, 0.03);
    if (event.type === 'REBOOT_COMMITTED') this.sequence([147, 110, 82], 0.12, 0.04);
    if (event.type === 'CORE_PROTOCOL_PURCHASED') this.sequence([330, 440, 523], 0.07, 0.026);
    if (event.type === 'DEPTH_ENTERED') this.sequence([220, 196, 165], 0.1, 0.025);
    const notice = rewardNotice(event);
    if (notice && (this.context.currentTime >= this.rewardSoundUntil || notice.priority > this.rewardPriority)) {
      this.rewardPriority = notice.priority;
      this.rewardSoundUntil = this.context.currentTime + (notice.priority >= 4 ? 1.2 : 0.45);
      this.sequence(notice.priority >= 4 ? [587, 784, 988] : notice.priority >= 2 ? [740, 988] : [660], 0.07, 0.024);
    }
  }

  private sequence(frequencies: number[], duration: number, gain: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, 'square', gain, index * duration * 0.8));
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gainValue: number, delay = 0): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); oscillator.connect(gain).connect(context.destination);
    oscillator.start(start); oscillator.stop(start + duration);
  }
}
