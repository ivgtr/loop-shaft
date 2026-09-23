import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { deriveInteractionTargets } from '../src/render/interactionTargets';

type Sheet = { cell: [number, number]; anchor: [number, number]; columns: number; frames: { name: string; pixels: string[] }[] };
type Art = { sheets: Record<string, Sheet> };
const art = JSON.parse(readFileSync(new URL('../art/d001/discovery-sprites.json', import.meta.url), 'utf8')) as Art;

// Authoring diagnostics, never a merge gate. assets:check already validates
// palette keys/rows and regenerates the exact PNG; do not repeat that work here.
describe('authored atlas geometry', () => {
  it('keeps PNG dimensions and anchors consistent with editable sheet metadata', () => {
    const work = JSON.parse(readFileSync(new URL('../art/d001/work-sprites.json', import.meta.url), 'utf8')) as Art;
    for (const source of [art, work]) for (const [name, sheet] of Object.entries(source.sheets)) {
      const [w, h] = sheet.cell;
      expect(sheet.frames.length).toBeGreaterThan(0);
      sheet.anchor.forEach((point, axis) => {
        expect(Number.isInteger(point)).toBe(true);
        expect(point).toBeGreaterThanOrEqual(0);
        expect(point).toBeLessThanOrEqual(sheet.cell[axis]!);
      });
      const png = readFileSync(new URL(`../public/assets/d001/runtime/${name}.png`, import.meta.url));
      expect(png.readUInt32BE(16)).toBe(w * sheet.columns);
      expect(png.readUInt32BE(20)).toBe(h * Math.ceil(sheet.frames.length / sheet.columns));
    }
  });

  it('keeps painted deposit pixels inside the existing selectable circle', () => {
    const state = createGameState(11);
    const targets = deriveInteractionTargets(state);
    for (const node of state.run.floors['D-001'].nodes) {
      const target = targets.find(t => t.key === `node:${node.id}`)!;
      const sheet = art.sheets[`node-${node.id}-atlas`]!;
      const hit = target.hitShapes[0]!;
      if (hit.type !== 'circle') throw new Error('Update the authoring probe for the new hit shape');
      // Existing atlas placement: the hit circle is nine pixels above its feet.
      for (const { pixels: rows } of sheet.frames) for (let y = 0; y < sheet.cell[1]; y++) for (let x = 0; x < sheet.cell[0]; x++) {
        if (rows[y]![x] !== '.') {
          expect((x - sheet.anchor[0]) ** 2 + (y - (sheet.anchor[1] - 9)) ** 2).toBeLessThanOrEqual(hit.radius ** 2);
        }
      }
    }
  });
});
