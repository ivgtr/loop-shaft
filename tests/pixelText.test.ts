import { describe, expect, it } from 'vitest';
import {
  drawPixelText,
  fitPixelFont,
  measurePixelText,
  pixelTextHeight,
} from '../src/render/pixelText';

describe('pixel text', () => {
  it('provides fixed-width standard and compact glyphs with a visible unknown fallback', () => {
    expect(measurePixelText('A0·→?', 'standard')).toBe(29);
    expect(measurePixelText('A0·→?', 'compact')).toBe(19);
    expect(measurePixelText('é', 'standard')).toBe(measurePixelText('?', 'standard'));
    expect(pixelTextHeight('standard')).toBe(7);
    expect(pixelTextHeight('compact')).toBe(5);
    expect(fitPixelFont('LOOP SHAFT', 40)).toBe('compact');
    expect(fitPixelFont('LOOP SHAFT', 80)).toBe('standard');
  });

  it('draws aligned integer rectangles without changing the text anchor', () => {
    const rectangles: Array<[number, number, number, number]> = [];
    const context = { fillRect: (x: number, y: number, width: number, height: number) => rectangles.push([x, y, width, height]) } as unknown as CanvasRenderingContext2D;

    const metrics = drawPixelText(context, 'A', 10, 7, { align: 'center', baseline: 'bottom' });

    expect(metrics).toEqual({ width: 5, height: 7 });
    expect(rectangles.length).toBeGreaterThan(0);
    expect(rectangles.every(([x, y, width, height]) => Number.isInteger(x) && Number.isInteger(y) && width === 1 && height === 1)).toBe(true);
    expect(Math.min(...rectangles.map(([x]) => x))).toBe(8);
    expect(Math.max(...rectangles.map(([x]) => x))).toBe(12);
    expect(Math.min(...rectangles.map(([, y]) => y))).toBe(1);
    expect(Math.max(...rectangles.map(([, y]) => y))).toBe(7);
  });
});
