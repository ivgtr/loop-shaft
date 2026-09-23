import type { EquipmentItem, EquipmentSlot, GameState } from '../game/types';
import type { CharacterRenderState } from './semanticRenderState';

export interface WorkEquipment {
  /** Atlas rows: the two workshop tools, then the three existing field tools. */
  readonly tool: 0 | 1 | 2 | 3 | 4;
  readonly stowed: boolean;
  readonly pack: 0 | 1 | 2 | null;
  readonly lamp: 0 | 1 | 2 | null;
}

export function equippedItem(state: Readonly<GameState>, slot: EquipmentSlot): EquipmentItem | undefined {
  const equipment = state.run.phase5.equipment;
  return equipment.inventory.find((item) => item.id === equipment.equippedPlayer[slot] && item.slot === slot);
}

/** Shared by the equipped actor and inventory comparison; multi-affix precedence stays identical. */
export function toolSpriteRow(item?: Pick<EquipmentItem, 'affixes'>, workshopLevel = 1): WorkEquipment['tool'] {
  const has = (id: EquipmentItem['affixes'][number]['id']) => item?.affixes.some((affix) => affix.id === id);
  return has('FOSSIL_BREAKER') ? 2 : has('RESEARCH_PRISM') ? 4 : has('LIGHT_FRAME') ? 3
    : item || workshopLevel === 2 ? 1 : 0;
}

/** Only the equipped, appraised inventory is consulted; no drop seeds or new progression. */
export function workEquipment(state: Readonly<GameState>): WorkEquipment {
  const tool = equippedItem(state, 'TOOL');
  const pack = equippedItem(state, 'PACK');
  const lamp = equippedItem(state, 'LAMP');
  const has = (item: EquipmentItem | undefined, id: EquipmentItem['affixes'][number]['id']) => item?.affixes.some((affix) => affix.id === id);
  return {
    tool: toolSpriteRow(tool, state.run.tool.level),
    stowed: Boolean(tool),
    pack: !pack ? null : has(pack, 'CARGO_HOOK') || has(pack, 'LOAD_HOOK') ? 2
      : pack.baseId === 'field-frame' || has(pack, 'LIGHT_FRAME') ? 1 : 0,
    lamp: !lamp ? null : has(lamp, 'SURVEY_LAMP_MK2') ? 2 : has(lamp, 'RESEARCH_PRISM') ? 1 : 0,
  };
}

const LAMP_ATTACHMENTS: Record<CharacterRenderState['clip'], readonly (readonly [number, number] | null)[]> = {
  idle: [[27, 13], [27, 13]],
  walk: [[25, 13], [27, 11], [27, 13], [27, 12]],
  'mine-ready': [[23, 14], [23, 15]],
  'mine-swing': [[26, 15], null, null, [25, 21], [23, 19], [20, 15], [24, 10], [25, 12]],
  collect: [[29, 26], [29, 27], [26, 20], [26, 20]],
  'carry-walk': [[26, 17], [26, 16], [24, 18], [25, 16]],
  'carry-idle': [[25, 17], [24, 16]],
  load: [[30, 16], [29, 19], [28, 12], [27, 10]],
};

/** Attachment points follow the existing poses; the head can be hidden behind raised arms. */
export function equipmentAttachment(actor: Pick<CharacterRenderState, 'clip' | 'frame'>): {
  pack: { x: number; y: number }; lamp: { x: number; y: number } | null;
} {
  const lens = LAMP_ATTACHMENTS[actor.clip][actor.frame];
  const pack = actor.clip === 'collect' ? { x: 3, y: actor.frame < 2 ? 8 : 3 }
    : actor.clip === 'mine-swing' ? { x: 0, y: actor.frame === 3 ? 5 : 2 }
    : { x: 0, y: actor.clip === 'walk' || actor.clip === 'carry-walk' ? actor.frame % 2 : 0 };
  return { pack, lamp: lens ? { x: lens[0] - 5, y: lens[1] - 4 } : null };
}

/** Contact is on the near face of the rock; the same point drives the impact tool and debris. */
export function miningContact(state: Readonly<GameState>, nodeId = state.run.character.targetNodeId): { x: number; y: number } | null {
  const character = state.run.character;
  const node = state.run.floors[state.run.depth.current].nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  // Horizontal input may stop anywhere within mining reach. Keep the contact inside the rock.
  return {
    x: Math.round(Math.max(node.x - 8, Math.min(node.x + 8, character.x + character.facing * 13))),
    y: Math.round(node.y + (state.run.depth.current === 'D-001' ? 13 : 0) - 12),
  };
}
