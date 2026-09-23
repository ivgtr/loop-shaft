import { shipmentNotice } from '../game/shipmentFeedback';
import { WorkFeedback } from '../game/workFeedback';
import { drawShipmentNotice } from './shipmentNotice';
import { MiningImpactEffects } from './miningImpactEffects';
import { collectionSpriteFrame } from './discoveryVisuals';
import { rewardNotice, RewardNoticeQueue, type ActiveRewardNotice, type FeedbackOutput } from '../game/rewardFeedback';
import { DEFAULT_PRESENTATION } from '../game/presentationSettings';
import { drawRewardEffect, rewardAccent } from './rewardEffects';
import { WORLD } from '../game/config';
import type { GameEvent, GameState } from '../game/types';
import { drawD001ElevatorFrontLayer, drawEntities } from './entities';
import { drawEnvironment } from './environment';
import { PALETTE } from './palette';
import type { D001AssetStore } from './d001ImageRenderer';
import { D001_VISUAL_GROUND_OFFSET, deriveSemanticRenderState, type SemanticRenderState } from './semanticRenderState';
import { drawPixelText } from './pixelText';

type GainFx = { label: string; startedAt: number };

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly impacts = new MiningImpactEffects();
  private readonly notices = new RewardNoticeQueue();
  private readonly workFeedback = new WorkFeedback();
  private presented: ActiveRewardNotice | null = null;
  private state: GameState | null = null;
  private run: GameState['run'] | null = null;
  private depth: string | null = null;
  private lastTime = 0;
  private gain: GainFx | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly assets: D001AssetStore, private readonly output?: FeedbackOutput) {
    this.canvas = canvas;
    canvas.width = WORLD.width; canvas.height = WORLD.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required.');
    context.imageSmoothingEnabled = false; this.ctx = context;
  }

  clearFeedback(): void {
    this.notices.clear(); this.impacts.clear();
    if (this.presented) this.output?.reward(null);
    this.presented = null; this.gain = null;
  }

  private sync(state: GameState, now: number): void {
    if (this.run !== state.run || this.depth !== state.run.depth.current || state.run.elevator.travel || now < this.lastTime) this.clearFeedback();
    this.run = state.run; this.depth = state.run.depth.current; this.state = state; this.lastTime = now;
  }

  handleEvent(event: GameEvent, state: GameState, now: number, batch: readonly GameEvent[] = [event]): void {
    this.sync(state, now);
    this.impacts.hit(event, state, now);
    if (event.type === 'REBOOT_COMMITTED') this.clearFeedback();
    const workNotices = this.workFeedback.handle(event, state);
    const notice = event.type === 'SHIPMENT_APPRAISED' ? shipmentNotice(event, batch)
      : event.data?.shipmentId ? null : rewardNotice(event);
    // Offscreen mining is not a local spectacle. Global, delivered appraisals remain visible.
    if (notice && !state.run.elevator.travel && (!notice.origin || (notice.origin.depth === state.run.depth.current
      && state.run.floors[state.run.depth.current].nodes.some(node => node.id === notice.origin!.nodeId)))) this.notices.push(notice, now);
    for (const work of workNotices) this.notices.push(work, now);
    if (event.type === 'RESEARCH_COMPLETED') this.gain = { label: `RESEARCH COMPLETE · ${String(event.data?.research ?? '')}`, startedAt: now };
    if (event.type === 'CORE_CHARGE_GAINED') this.gain = { label: `CORE CHARGE +${Number(event.data?.amount ?? 0)}`, startedAt: now };
    if (event.type === 'DATA_GAIN') this.gain = { label: `DATA +${Number(event.data?.amount ?? 0)}`, startedAt: now };
    if (event.type === 'CORE_GAINED') this.gain = { label: `CORE +${Number(event.data?.amount ?? 0)}`, startedAt: now };
  }

  worldShake(state: GameState, now: number): number {
    this.sync(state, now);
    const shake = this.impacts.shake(state, now);
    return (this.output?.settings() ?? DEFAULT_PRESENTATION).motion ? shake : 0;
  }

  render(state: GameState, now: number, frame?: SemanticRenderState): void {
    this.sync(state, now);
    this.ctx.save();
    const semantic = frame ?? deriveSemanticRenderState(state, now);
    drawEnvironment(this.ctx, state, this.assets, now);
    drawEntities(this.ctx, state, now, semantic, this.assets);
    if (state.run.depth.current === 'D-001' && state.run.elevator.travel) drawD001ElevatorFrontLayer(this.ctx, state, semantic, now, this.assets);
    this.ctx.restore();
    if (state.run.elevator.travel) this.drawTravel(state);
  }

  drawForegroundFx(now: number, shake = 0): void { this.drawFx(now, shake); }

  private drawTravel(state: GameState): void {
    const travel = state.run.elevator.travel;
    if (!travel) return;
    const progress = 1 - travel.remaining / travel.duration;
    this.ctx.fillStyle = '#08090bdd'; this.ctx.fillRect(0, 38, WORLD.width, WORLD.height - 38);
    this.ctx.fillStyle = '#171c1f';
    for (let y = -20; y < WORLD.height + 30; y += 28) {
      const offset = Math.round(progress * 28); this.ctx.fillRect(0, y + offset, WORLD.width, 8);
    }
    this.ctx.fillStyle = PALETTE.white;
    drawPixelText(this.ctx, travel.viaSurface ? 'SURFACE RELAY' : 'ELEVATOR TRAVEL', WORLD.width / 2, 124, { font: 'standard', align: 'center', baseline: 'bottom' });
    this.ctx.fillStyle = PALETTE.d060Lamp;
    drawPixelText(this.ctx, `${travel.from} → ${travel.to}`, WORLD.width / 2, 137, { font: 'standard', align: 'center', baseline: 'bottom' });
  }

  private drawFx(now: number, shake: number): void {
    const settings = this.output?.settings() ?? DEFAULT_PRESENTATION;
    this.ctx.save(); this.ctx.translate(shake, 0);
    this.ctx.fillStyle = '#8b7770';
    if (settings.motion) for (const pixel of this.impacts.pixels(now)) this.ctx.fillRect(pixel.x, pixel.y, 2, 2);
    this.ctx.restore();
    const movement = this.state && this.workFeedback.movement(this.state);
    if (movement) this.notices.push(movement, now);
    const notice = this.notices.at(now);
    if (notice !== this.presented) {
      this.presented = notice;
      this.output?.reward(notice);
    }
    if (notice) {
      const origin = notice.origin;
      const node = origin && this.state?.run.floors[this.state.run.depth.current].nodes.find(node => node.id === origin.nodeId);
      const workPoint = notice.work && notice.work.depth === this.depth && now - notice.queuedAt < 350 ? notice.work : null;
      const point = workPoint ? { x: workPoint.x + shake, y: workPoint.y } : node ? { x: Math.round(node.x) + shake, y: Math.round(node.y) - 10 + (origin?.depth === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0) } : null;
      if (point) drawRewardEffect(this.ctx, notice, point, now, settings);
      // Fine ore is a quiet local glint, not another full-width banner.
      if (notice.shipment) drawShipmentNotice(this.ctx, notice, this.assets, now, settings);
      else if (notice.effect !== 'fine') {
        const accent = rewardAccent(notice);
        this.ctx.fillStyle = '#111014'; this.ctx.fillRect(87, 53, 306, 26);
        this.ctx.strokeStyle = accent; this.ctx.strokeRect(87.5, 53.5, 305, 25);
        const image = (notice.specimen || notice.artifact) && this.assets.ready('discoveryCollection');
        if (image && (notice.specimen || notice.artifact)) {
          const frame = collectionSpriteFrame({ kind: notice.artifact ?? notice.specimen!.kind, discovered: true, count: 1, bestSpecimenGrade: notice.specimen?.grade });
          this.ctx.drawImage(image, frame % 5 * 24, Math.floor(frame / 5) * 24, 24, 24, 90, 54, 24, 24);
        }
        if (!point && notice.priority >= 4) drawRewardEffect(this.ctx, notice, null, now, settings);
        const center = image ? 254 : 240; const limit = image ? 43 : 48;
        this.ctx.fillStyle = accent;
        drawPixelText(this.ctx, notice.detail.toUpperCase().slice(0, limit), center, 64, { font: 'standard', align: 'center', baseline: 'bottom' });
        this.ctx.fillStyle = PALETTE.white;
        drawPixelText(this.ctx, notice.label.toUpperCase().slice(0, limit), center, 75, { font: 'standard', align: 'center', baseline: 'bottom' });
      }
    }
    if (this.gain && now - this.gain.startedAt < 1200) {
      this.ctx.fillStyle = '#101214e8'; this.ctx.fillRect(147, 9, 186, 16);
      this.ctx.fillStyle = PALETTE.d060Lamp;
      drawPixelText(this.ctx, this.gain.label, 240, 19, { font: 'standard', align: 'center', baseline: 'bottom' });
    } else if (this.gain) this.gain = null;
  }
}
