import { getModifiers } from '../modifiers';
import { crewMiningDamage, crewMoveSpeed, equipCrewItem, equipPlayerItem } from '../phase5';
import type { EquipmentItem, EquipmentSlot, GameState } from '../types';
import { commandAction, information, number, type ManagementState, type StationItem, type StationView } from './types';

const SLOTS: EquipmentSlot[] = ['TOOL', 'BOOTS', 'PACK', 'LAMP'];

export function equipmentView(state: GameState, ui: ManagementState): StationView {
  const crew = state.run.phase5.crew.members.find((member) => member.id === ui.subjectId);
  const slots = crew ? SLOTS.filter((slot) => slot === 'TOOL' || slot === 'LAMP') : SLOTS;
  const slot = slots.find((candidate) => candidate === ui.tab) ?? slots[0]!;
  const inventory = state.run.phase5.equipment.inventory;
  return {
    title: crew ? `${crew.name} GEAR` : 'RECOVERED GEAR',
    tabs: slots.map((id) => ({ id, label: id })),
    back: crew ? { station: 'crew', subjectId: crew.id, tab: 'gear' } : 'workshop',
    // Preserve acquisition order and stable IDs, including duplicates and old items.
    items: inventory.filter((item) => item.slot === slot).map((item) => equipmentItem(state, item, crew?.id, item.id === ui.selectedId || !ui.selectedId))
      .concat(inventory.some((item) => item.slot === slot) ? [] : [information('empty', `No recovered ${slot.toLowerCase()}`,
        'Appraise sealed equipment at Surface.', ['All appraised items remain accessible here. Basic equipment is upgraded at the workbench.'])]),
  };
}

export function equipmentItem(state: GameState, item: EquipmentItem, crewId?: string, detailed = true): StationItem {
  const equipment = state.run.phase5.equipment;
  const crew = state.run.phase5.crew.members.find((member) => member.id === crewId);
  const currentId = crew ? crew.equipment[item.slot as 'TOOL' | 'LAMP'] : equipment.equippedPlayer[item.slot];
  const current = equipment.inventory.find((candidate) => candidate.id === currentId);
  const owned = currentId === item.id;
  const owner = equipmentOwner(state, item.id);
  const target = crew?.name ?? 'Player';
  const transfer = !owned && owner !== null;
  const lines = [`Currently equipped: ${current?.name ?? 'Basic equipment'}${current ? ` (${current.rarity}, Lv.${current.level})` : ''}.`,
    ...(detailed ? equipmentComparison(state, item, crewId) : []),
    'Candidate effects:', ...item.affixes.map((affix) => `${affix.name}: ${affix.description}`),
    ...(item.affixes.length ? [] : ['No additional affixes.']),
    ...(current ? ['Replaced effects:', ...current.affixes.map((affix) => `${affix.name}: ${affix.description}`)] : []),
    ...(transfer ? [`This item is equipped by ${owner}. Moving it to ${target} removes it from that owner.`] : []),
    `Instance ${item.id}. Rarity and level alone are not a damage multiplier.`];
  return { id: item.id, name: item.name, summary: `${item.rarity} · ${item.slot} · Lv.${item.level} · ${owner ?? 'Stored'}`,
    lines, reason: owned ? `Equipped by ${target}.` : null, active: owned,
    actionLabel: owned ? 'EQUIPPED' : `EQUIP TO ${target.toUpperCase()}`,
    action: owned ? null : commandAction(crewId ? { type: 'equip-crew-item', itemId: item.id, crewId } : { type: 'equip-item', itemId: item.id }),
    confirmKey: transfer ? JSON.stringify([item.id, owner, currentId, crewId ?? 'PLAYER']) : undefined };
}

export function equipmentOwner(state: GameState, itemId: string): string | null {
  if (Object.values(state.run.phase5.equipment.equippedPlayer).includes(itemId)) return 'Player';
  return state.run.phase5.crew.members.find((member) => Object.values(member.equipment).includes(itemId))?.name ?? null;
}

/** Run the SAME equip operation on a detached state; never mutate live ownership, events or RNG. */
export function equipmentComparison(state: GameState, item: EquipmentItem, crewId?: string): string[] {
  const after = structuredClone(state);
  if (crewId) {
    equipCrewItem(after, crewId, item.id);
    const before = state.run.phase5.crew.members.find((member) => member.id === crewId)!;
    const next = after.run.phase5.crew.members.find((member) => member.id === crewId)!;
    const nodes = state.run.floors[before.assignedDepth].nodes;
    const target = nodes.find((node) => node.id === before.targetNodeId) ?? nodes[0];
    return [`Walk speed: ${number(crewMoveSpeed(state, before))} → ${number(crewMoveSpeed(after, next))} px/s.`,
      ...(before.role === 'MINER' && target ? [`Hit on ${target.name}: ${crewMiningDamage(state, before, target)} → ${crewMiningDamage(after, next, target)}. Target-dependent effects are included.`] : [`Cargo capacity: ${before.capacity} → ${next.capacity} kg.`]),
      'Worker effects depend on role and target. Not every player affix applies to a worker.'];
  }
  equipPlayerItem(after, item.id);
  const beforeMods = getModifiers(state); const afterMods = getModifiers(after);
  return [
    `Base hit: ${Math.max(1, Math.round(state.run.tool.damage * beforeMods.miningDamageMultiplier))} → ${Math.max(1, Math.round(after.run.tool.damage * afterMods.miningDamageMultiplier))} (before finishing bonuses).`,
    `Walk speed: ${number(beforeMods.playerMoveSpeed)} → ${number(afterMods.playerMoveSpeed)} px/s in the current load state.`,
    `Pack: ${number(state.run.character.backpackCapacity)} → ${number(after.run.character.backpackCapacity)} kg.`,
    `Research signal weight: x${number(beforeMods.researchWeightMultiplier)} → x${number(afterMods.researchWeightMultiplier)}.`,
    `Treasure chance modifier: x${number(beforeMods.treasureChanceMultiplier)} → x${number(afterMods.treasureChanceMultiplier)}.`,
  ];
}
