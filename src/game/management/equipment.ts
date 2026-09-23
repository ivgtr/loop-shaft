import { getModifiers } from '../modifiers';
import { playerMiningDamage } from '../mining';
import { crewMiningDamage, crewMoveSpeed, equipCrewItem, equipPlayerItem } from '../phase5';
import type { EquipmentItem, EquipmentSlot, GameState } from '../types';
import { commandAction, information, number, type EquipmentMetric, type EquipmentPreview, type ManagementState, type StationItem, type StationView } from './types';

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
    // IDs and acquisition order stay stable even when several finds have the same name.
    items: inventory.filter((item) => item.slot === slot).map((item) => equipmentItem(state, item, crew?.id, item.id === ui.selectedId || !ui.selectedId))
      .concat(inventory.some((item) => item.slot === slot) ? [] : [information('empty', `No recovered ${slot.toLowerCase()}`,
        'Bring sealed equipment to Surface.', ['Basic tools are upgraded at the workshop.'])]),
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
  const preview = detailed ? equipmentPreview(state, item, crewId) : undefined;
  const lines = [
    `Current: ${current?.name ?? 'Basic equipment'}. Candidate: ${item.name}.`,
    ...(preview ? preview.metrics.map(metricDescription) : []),
    'CANDIDATE EFFECTS', ...item.affixes.map((affix) => `${affix.name}: ${affix.description}`),
    ...(item.affixes.length ? [] : ['No additional effects.']),
    ...(current ? ['REPLACED EFFECTS', ...current.affixes.map((affix) => `${affix.name}: ${affix.description}`)] : []),
    ...(crew ? ['Only effects compatible with this worker and task apply.'] : ['Hit power is before vein-specific finishing bonuses. Research weight is not a drop probability.']),
  ];
  return { id: item.id, name: item.name, summary: `${item.rarity} · Lv.${item.level} · ${owner ?? 'Stored'}`,
    listDetail: `${item.rarity} · Lv.${item.level}`, badge: owned ? 'EQUIPPED' : owner ? owner.toUpperCase() : 'STORED',
    equipment: preview, lines, reason: owned ? `Equipped by ${target}.` : null, active: owned,
    actionLabel: owned ? 'EQUIPPED' : `EQUIP TO ${target.toUpperCase()}`,
    action: owned ? null : commandAction(crewId ? { type: 'equip-crew-item', itemId: item.id, crewId } : { type: 'equip-item', itemId: item.id }),
    decision: transfer ? { confirmLabel: 'TRANSFER & EQUIP', cancelLabel: 'CANCEL TRANSFER', facts: [
      { label: 'MOVE', value: item.name }, { label: 'FROM', value: `${owner} → ${target}` },
      { label: 'REMOVE', value: `${owner} will lose this item and its effects.`, warning: true },
      { label: 'REPLACE', value: `${current?.name ?? 'Basic equipment'} on ${target}.` },
    ] } : undefined,
    confirmKey: transfer ? JSON.stringify([item.id, owner, currentId, crewId ?? 'PLAYER']) : undefined };
}

export function equipmentOwner(state: GameState, itemId: string): string | null {
  if (Object.values(state.run.phase5.equipment.equippedPlayer).includes(itemId)) return 'Player';
  return state.run.phase5.crew.members.find((member) => Object.values(member.equipment).includes(itemId))?.name ?? null;
}

/** Run the actual equip operation on a detached state. Live ownership, events and RNG are unchanged. */
export function equipmentPreview(state: GameState, item: EquipmentItem, crewId?: string): EquipmentPreview {
  const after = structuredClone(state);
  const crew = state.run.phase5.crew.members.find((member) => member.id === crewId);
  const currentId = crew ? crew.equipment[item.slot as 'TOOL' | 'LAMP'] : state.run.phase5.equipment.equippedPlayer[item.slot];
  const current = state.run.phase5.equipment.inventory.find((candidate) => candidate.id === currentId);
  let metrics: EquipmentMetric[];
  if (crewId && crew) {
    equipCrewItem(after, crewId, item.id);
    const next = after.run.phase5.crew.members.find((member) => member.id === crewId)!;
    const nodes = state.run.floors[crew.assignedDepth].nodes;
    const target = nodes.find((node) => node.id === crew.targetNodeId) ?? nodes[0];
    metrics = [{ label: 'Walk speed', before: crewMoveSpeed(state, crew), after: crewMoveSpeed(after, next), unit: 'px/s' },
      ...(crew.role === 'MINER' && target ? [{ label: `Hit on ${target.name}`, before: crewMiningDamage(state, crew, target), after: crewMiningDamage(after, next, target) }]
        : [{ label: 'Cargo capacity', before: crew.capacity, after: next.capacity, unit: 'kg' }])];
  } else {
    equipPlayerItem(after, item.id);
    const before = getModifiers(state); const next = getModifiers(after);
    metrics = [
      { label: 'Base hit', before: Math.max(1, Math.round(state.run.tool.damage * before.miningDamageMultiplier)), after: Math.max(1, Math.round(after.run.tool.damage * next.miningDamageMultiplier)) },
      { label: 'Walk speed', before: before.playerMoveSpeed, after: next.playerMoveSpeed, unit: 'px/s' },
      { label: 'Loaded speed', before: getModifiers(state, true).playerMoveSpeed, after: getModifiers(after, true).playerMoveSpeed, unit: 'px/s' },
      ...state.run.floors[state.run.depth.current].nodes.filter((node) => node.fossilWeight >= 0.45).slice(0, 1).map((node) => ({ label: `Hit on ${node.name}`, before: playerMiningDamage(state, node), after: playerMiningDamage(after, node) })),
      { label: 'Pack', before: state.run.character.backpackCapacity, after: after.run.character.backpackCapacity, unit: 'kg' },
      { label: 'Research weight', before: before.researchWeightMultiplier, after: next.researchWeightMultiplier, unit: 'x' },
      { label: 'Treasure modifier', before: before.treasureChanceMultiplier, after: next.treasureChanceMultiplier, unit: 'x' },
    ];
  }
  const sameEffect = (a: EquipmentItem['affixes'][number], b: EquipmentItem['affixes'][number]) => a.id === b.id && a.value === b.value;
  return { slot: item.slot, current: current?.name ?? 'Basic equipment', candidate: item.name, metrics,
    gained: item.affixes.filter((affix) => !current?.affixes.some((old) => sameEffect(old, affix))).map((affix) => `${affix.name}: ${affix.description}`),
    lost: (current?.affixes ?? []).filter((affix) => !item.affixes.some((next) => sameEffect(affix, next))).map((affix) => `${affix.name}: ${affix.description}`),
  };
}
export function metricDescription(metric: EquipmentMetric): string {
  return `${metric.label}: ${number(metric.before)} → ${number(metric.after)}${metric.unit ? ` ${metric.unit}` : ''}.`;
}
export function equipmentComparison(state: GameState, item: EquipmentItem, crewId?: string): string[] {
  return equipmentPreview(state, item, crewId).metrics.map(metricDescription);
}
