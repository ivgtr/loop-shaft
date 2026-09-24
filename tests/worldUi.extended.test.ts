import { afterEach, describe, expect, it, vi } from 'vitest';
import { placeWorldLabel, WorldUi } from '../src/render/worldUi';

afterEach(() => vi.unstubAllGlobals());

describe('world text at display resolution', () => {
  it('projects translated world anchors without painting text into the low-resolution world and clears expired labels', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const worldText = vi.fn(); const outputText = vi.fn();
    const source = { getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 3, f: 12 }), fillStyle: '#fff', fillText: worldText } as unknown as CanvasRenderingContext2D;
    const output = { setTransform: vi.fn(), clearRect: vi.fn(), fillText: outputText, measureText: () => ({ width: 32 }) };
    const canvas = { width: 0, height: 0, style: {}, getContext: () => output,
      parentElement: { clientWidth: 960, clientHeight: 640, clientLeft: 1, clientTop: 1,
        getBoundingClientRect: () => ({ left: 19, top: 9 }) } } as unknown as HTMLCanvasElement;
    const world = { getBoundingClientRect: () => ({ left: 20, top: 110, width: 960, height: 540 }) } as HTMLCanvasElement;
    const ui = new WorldUi();
    ui.text(source, '採掘', 100, 50);
    expect(worldText).not.toHaveBeenCalled();
    ui.render(canvas, world);
    expect(canvas.width).toBe(1920); expect(canvas.height).toBe(1280);
    expect(outputText).toHaveBeenCalledWith('採掘', 206, 224);
    outputText.mockClear();
    ui.clear(); ui.render(canvas, world);
    expect(output.clearRect).toHaveBeenCalledTimes(2);
    expect(outputText).not.toHaveBeenCalled();
  });

  it('keeps a narrow-screen label inside the stage and outside the SEND cabinet', () => {
    const obstacle = { x: 172, y: 330, width: 104, height: 80 };
    const label = placeWorldLabel({ x: 240, y: 350, width: 120, height: 48 }, 320, 740, [obstacle]);
    expect(label.x).toBeGreaterThanOrEqual(0);
    expect(label.x + label.width).toBeLessThanOrEqual(320);
    expect(label.y + label.height <= obstacle.y || label.y >= obstacle.y + obstacle.height
      || label.x + label.width <= obstacle.x || label.x >= obstacle.x + obstacle.width).toBe(true);
  });
});
