import { describe, expect, it } from 'vitest';
import { createManagementState } from '../src/game/management';
import { layoutManagementUi } from '../src/render/managementUi';
import { managementGame } from './fixtures/management';

describe('facility text baseline spacing', () => {
  it('keeps desktop detail headings below the bottom of the category tabs', () => {
    const state = managementGame();
    state.meta.collection.entries[0]!.discovered = true;
    for (const station of ['archive', 'core'] as const) {
      const layout = layoutManagementUi(state, createManagementState(state, { station }), {
        width: 960, height: 628, world: { x: 0, y: 0, width: 960, height: 540 },
      });
      const tabBottom = Math.max(...layout.buttons.filter((button) => button.id.startsWith('station-tab-')).map((button) => button.y + button.height));
      const heading = layout.texts.find((run) => run.x === layout.textBox.x && run.label === layout.item.name)!;
      expect(heading).toBeDefined();
      expect(heading.y - heading.size).toBeGreaterThanOrEqual(tabBottom + 4);
    }
  });
});
