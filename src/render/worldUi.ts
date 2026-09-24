import { WORLD } from '../game/config';
import type { Point, Rect } from './interactionTargets';
import { UI_LINE_HEIGHT, uiFont, wrapUiText } from './uiTypography';

interface TextOptions { align?: 'left' | 'center' | 'right'; baseline?: 'top' | 'bottom'; }
export interface NoticeLine { text: string; color?: string; }
type WorldUiCommand =
  | { kind: 'text'; point: Point; text: string; color: string; options: TextOptions }
  | { kind: 'label'; point: Point; text: string; border: string }
  | { kind: 'notice'; point: Point; lines: NoticeLine[]; border: string; artwork?: (ctx: CanvasRenderingContext2D, x: number, y: number) => void };

/** World renderers only submit anchors and copy. Rasterization happens once at
 * display resolution, below the HUD/dialogs, on the same animation frame. */
export class WorldUi {
  private commands: WorldUiCommand[] = [];

  clear(): void { this.commands = []; }

  text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: TextOptions = {}): void {
    this.commands.push({ kind: 'text', point: this.anchor(ctx, x, y), text, color: String(ctx.fillStyle), options });
  }

  label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, border = '#916a4e'): void {
    this.commands.push({ kind: 'label', point: this.anchor(ctx, x, y), text, border });
  }

  notice(lines: NoticeLine[], y: number, border: string, artwork?: (ctx: CanvasRenderingContext2D, x: number, y: number) => void): void {
    this.commands.push({ kind: 'notice', point: { x: WORLD.width / 2, y }, lines, border, artwork });
  }

  private anchor(ctx: CanvasRenderingContext2D, x: number, y: number): Point {
    const m = ctx.getTransform();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  render(canvas: HTMLCanvasElement, worldCanvas: HTMLCanvasElement, obstacles: readonly Rect[] = []): void {
    const stage = canvas.parentElement;
    if (!stage) return;
    const stageBox = stage.getBoundingClientRect(); const scene = worldCanvas.getBoundingClientRect();
    const world = { x: scene.left - stageBox.left - stage.clientLeft, y: scene.top - stageBox.top - stage.clientTop,
      width: scene.width, height: scene.height };
    const width = stage.clientWidth; const height = stage.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr); const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    // A fractional 16:9 CSS height must not stretch already-rasterized glyphs.
    const cssWidth = `${pixelWidth / dpr}px`; const cssHeight = `${pixelHeight / dpr}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = uiFont(); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.imageSmoothingEnabled = false;
    const occupied = [...obstacles];
    for (const command of this.commands) {
      const x = world.x + command.point.x * world.width / WORLD.width;
      const y = world.y + command.point.y * world.height / WORLD.height;
      if (command.kind === 'text') {
        const label = elide(ctx, command.text, width - 8);
        const textWidth = ctx.measureText(label).width;
        const left = x - (command.options.align === 'center' ? textWidth / 2 : command.options.align === 'right' ? textWidth : 0);
        ctx.fillStyle = command.color;
        ctx.fillText(label, Math.round(clamp(left, 4, width - textWidth - 4)), Math.round(clamp(y - (command.options.baseline === 'bottom' ? 16 : 0), 2, height - 18)));
        continue;
      }
      const notice = command.kind === 'notice';
      const artwork = notice ? command.artwork : undefined;
      const maxWidth = Math.min(width - 8, notice ? 600 : 400);
      const inset = artwork ? 40 : 8;
      const lines = (notice ? command.lines : [{ text: command.text }]).flatMap(line =>
        wrapUiText(line.text, maxWidth - inset - 8).map(text => ({ text, color: line.color ?? '#eee3ca' })));
      const boxWidth = Math.min(maxWidth, Math.max(...lines.map(line => ctx.measureText(line.text).width), 0) + inset + 8);
      const boxHeight = Math.max(artwork ? 40 : 0, lines.length * UI_LINE_HEIGHT + 8);
      const position = placeWorldLabel({ x: x - boxWidth / 2, y: notice ? y : y - boxHeight - 6, width: boxWidth, height: boxHeight }, width, height, occupied);
      occupied.push(position);
      const left = position.x; const top = position.y;
      ctx.fillStyle = '#0b0b0df5'; ctx.fillRect(left, top, boxWidth, boxHeight);
      ctx.fillStyle = command.border; ctx.fillRect(left, top + boxHeight - 2, boxWidth, 2);
      ctx.save(); artwork?.(ctx, left + 8, top + 8); ctx.restore();
      lines.forEach((line, index) => { ctx.fillStyle = line.color; ctx.fillText(line.text, left + inset, top + 4 + index * UI_LINE_HEIGHT); });
    }
  }
}

function elide(ctx: CanvasRenderingContext2D, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  const characters = Array.from(value);
  while (characters.length && ctx.measureText(`${characters.join('')}…`).width > width) characters.pop();
  return `${characters.join('')}…`;
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

/** Keep readable labels close to their anchor without covering an action. */
export function placeWorldLabel(box: Rect, width: number, height: number, obstacles: readonly Rect[]): Rect {
  const fit = (x: number, y: number): Rect => ({ ...box,
    x: Math.round(clamp(x, 4, width - box.width - 4)), y: Math.round(clamp(y, 2, height - box.height - 2)) });
  const preferred = fit(box.x, box.y);
  const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const candidates = [preferred, ...obstacles.flatMap(obstacle => [
    fit(box.x, obstacle.y - box.height - 6), fit(box.x, obstacle.y + obstacle.height + 6),
    fit(obstacle.x - box.width - 6, box.y), fit(obstacle.x + obstacle.width + 6, box.y),
  ])];
  const score = (candidate: Rect) => obstacles.reduce((area, obstacle) => area + overlap(candidate, obstacle), 0) * 10000
    + Math.abs(candidate.x - preferred.x) + Math.abs(candidate.y - preferred.y);
  return candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
}
