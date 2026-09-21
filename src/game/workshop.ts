import { PLAYER_PACK_CAPACITY, PLAYER_TOOL_DAMAGE, UPGRADE_COSTS } from './config';
import { getModifiers } from './modifiers';
import { upgradeBlockReason, type UpgradeAction } from './playerControls';
import type { GameState } from './types';
import type { GameCommand } from '../runtime/commands';

export type WorkshopTab = 'equipment' | 'automation' | 'recovered';
export type WorkshopIcon = 'pick' | 'boots' | 'pack' | 'swing' | 'porter' | 'lamp';
export interface WorkshopItem {
  readonly id: string;
  readonly tab: WorkshopTab;
  readonly name: string;
  readonly icon: WorkshopIcon;
  readonly owned: boolean;
  readonly cost: number | null;
  readonly comparison: string;
  readonly description: string;
  readonly reason: string | null;
  readonly actionLabel: string;
  readonly command: GameCommand | null;
}
export interface WorkshopState {
  readonly selectedId: string;
  readonly notice: string | null;
  readonly runIndex: number;
  readonly depth: GameState['run']['depth']['current'];
}

/** Presentation only. Prices and purchase gates come from the simulation's source of truth. */
export function workshopItems(state: GameState): WorkshopItem[] {
  const run = state.run;
  const mods = getModifiers(state);
  const faster = { ...state, run: { ...run, boots: { ...run.boots, level: 2 as const } } };
  const items = [
    upgrade('upgrade-tool', 'equipment', 'Steel Pick', 'pick', run.tool.level === 2, UPGRADE_COSTS.tool,
      `Hit power  ${Math.round(run.tool.damage * mods.miningDamageMultiplier)}${run.tool.level === 1 ? ` → ${Math.round(PLAYER_TOOL_DAMAGE[2] * mods.miningDamageMultiplier)}` : ''}`,
      'Break rock with fewer swings. Finishing bonuses depend on the vein.'),
    upgrade('upgrade-boots', 'equipment', 'Runner Boots', 'boots', run.boots.level === 2, UPGRADE_COSTS.boots,
      `Walk speed  ${number(mods.playerMoveSpeed)}${run.boots.level === 1 ? ` → ${number(getModifiers(faster).playerMoveSpeed)}` : ''} px/s`,
      'Spend less time walking to veins and carrying ore back.'),
    upgrade('upgrade-pack', 'equipment', 'Frame Pack', 'pack', run.pack.level === 2, UPGRADE_COSTS.pack,
      `Carry capacity  ${number(run.character.backpackCapacity)}${run.pack.level === 1 ? ` → ${PLAYER_PACK_CAPACITY[2]}` : ''} kg`,
      'Carry more ore per trip. Pickup and return remain your choice.'),
    upgrade('unlock-auto-swing', 'automation', 'Auto Swing', 'swing', run.automation.autoSwing.unlocked, UPGRADE_COSTS.autoSwing,
      run.automation.autoSwing.unlocked ? `Auto Swing  ${run.automation.autoSwing.enabled ? 'ON' : 'OFF'}` : 'Manual swings → repeated swings',
      'Mines the vein you approach. Does not pick up or carry ore.'),
    upgrade('unlock-porter', 'automation', 'Hire Porter', 'porter', run.porter.enabled, UPGRADE_COSTS.porter,
      `Floor ore → lift  ·  ${number(run.porter.capacity)} kg/trip`,
      'A worker picks up and carries ore. You still choose when to send the lift.'),
  ];
  if (run.automation.autoSwing.unlocked) {
    const item = items.find((candidate) => candidate.id === 'unlock-auto-swing')!;
    items[items.indexOf(item)] = { ...item, reason: null, command: { type: 'toggle-auto-swing' },
      actionLabel: run.automation.autoSwing.enabled ? 'Switch Auto Swing OFF' : 'Switch Auto Swing ON' };
  }
  // Keep all existing recovered gear accessible while its richer comparison UI is a later stage.
  for (const item of run.phase5.equipment.inventory) {
    const owned = run.phase5.equipment.equippedPlayer[item.slot] === item.id;
    const crewOwner = run.phase5.crew.members.find((member) => Object.values(member.equipment).includes(item.id));
    items.push({ id: item.id, tab: 'recovered', name: item.name,
      icon: item.slot === 'TOOL' ? 'pick' : item.slot === 'BOOTS' ? 'boots' : item.slot === 'PACK' ? 'pack' : 'lamp',
      owned, cost: null, comparison: `${item.rarity} · ${item.slot} · Lv.${item.level}`,
      description: item.affixes.map((affix) => affix.name).join(' / ') || 'Recovered equipment.',
      reason: owned ? 'Equipped by you' : crewOwner ? `Reassigns equipment from ${crewOwner.name}` : null,
      actionLabel: owned ? 'Equipped' : 'Equip recovered item', command: owned ? null : { type: 'equip-item', itemId: item.id } });
  }
  return items;

  function upgrade(id: UpgradeAction, tab: WorkshopTab, name: string, icon: WorkshopIcon, owned: boolean,
    cost: number, comparison: string, description: string): WorkshopItem {
    const reason = upgradeBlockReason(state, id);
    return { id, tab, name, icon, owned, cost, comparison, description,
      reason: owned ? (tab === 'equipment' ? 'Equipped' : 'Installed') : reason,
      actionLabel: owned ? (tab === 'equipment' ? 'Equipped' : 'Installed') : `Buy ${name} · ${cost} Scrap`,
      command: owned || reason ? null : { type: id } };
  }
}

export function selectedWorkshopItem(items: readonly WorkshopItem[], selectedId: string): WorkshopItem {
  return items.find((item) => item.id === selectedId) ?? items[0]!;
}

export function nextWorkshopUpgrade(state: GameState): WorkshopItem | null {
  const items = workshopItems(state);
  return ['upgrade-tool', 'upgrade-boots', 'unlock-auto-swing', 'upgrade-pack', 'unlock-porter']
    .map((id) => items.find((item) => item.id === id)!).find((item) => !item.owned) ?? null;
}

export interface WorkshopGuide { readonly label: string; readonly ready: boolean; }
export function workshopGuide(state: GameState): WorkshopGuide | null {
  const { run, meta } = state;
  if (meta.runIndex !== 1 || run.depth.current !== 'D-001' || run.depth.unlocked.length > 1 || meta.bestDepth !== 'D-001') return null;
  if (run.stats.elevatorTrips === 0 && run.scrap === 0) return null;
  const next = nextWorkshopUpgrade(state);
  if (!next) return null;
  return { ready: next.command !== null,
    label: next.command ? `Workshop: ${next.name} ready` : `${next.name} · ${next.reason?.toLowerCase()}` };
}

function number(value: number): string { return Number(value.toFixed(1)).toString(); }
