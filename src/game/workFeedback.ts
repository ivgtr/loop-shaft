import { getModifiers } from './modifiers';
import type { RewardNotice } from './rewardFeedback';
import type { EquipmentSlot, GameEvent, GameState } from './types';

type PendingGear = { key: string; slot: EquipmentSlot; target: string; id: string | null; name: string; x: number; loadedOnly: boolean };

/** Session-local acknowledgements, armed by real changes, never by loading an existing save. */
export class WorkFeedback {
  private run: GameState['run'] | null = null;
  private gear = new Map<string, PendingGear>();
  private armed = new Set<string>();
  private seen = new Set<string>();
  private depth = '';
  private autoNode: string | null = null;
  private autoShipment: string | null = null;

  private sync(state: GameState): void {
    if (this.run === state.run) {
      if (this.depth !== state.run.depth.current || state.run.elevator.travel) {
        for (const pending of this.gear.values()) pending.x = state.run.character.x;
        this.autoNode = null;
      }
      this.depth = state.run.depth.current;
      return;
    }
    this.run = state.run; this.depth = state.run.depth.current; this.gear.clear(); this.armed.clear(); this.seen.clear();
    this.autoNode = null; this.autoShipment = null;
  }

  handle(event: GameEvent, state: GameState): RewardNotice[] {
    this.sync(state);
    const data = event.data ?? {}; const result: RewardNotice[] = [];
    if (event.type === 'EQUIPMENT_CHANGED' || event.type === 'EQUIPMENT_EQUIPPED') {
      const target = String(data.target ?? 'PLAYER'); const slot = data.slot as EquipmentSlot;
      const item = state.run.phase5.equipment.inventory.find(item => item.id === data.id);
      const id = item?.id ?? null; const key = `gear:${target}:${slot}:${id ?? data.name}`;
      this.gear.delete(`${target}:${slot}`);
      if (!this.seen.has(key) && ['TOOL', 'BOOTS', 'PACK', 'LAMP'].includes(slot)) this.gear.set(`${target}:${slot}`, {
        key, target, slot, id, name: item?.name ?? String(data.name), x: state.run.character.x,
        loadedOnly: target === 'PLAYER' && slot === 'TOOL' && Boolean(item?.affixes.some(affix => affix.id === 'LIGHT_FRAME')),
      });
    }
    if (event.type === 'AUTOMATION_UNLOCKED') this.armed.add(String(data.automation));
    if (event.type === 'PORTER_UNLOCKED') this.armed.add('PORTER');
    if (event.type === 'CREW_HIRED' && data.crewId) this.armed.add(String(data.crewId));
    if (event.type === 'TRANSPORT_LINE_READY' && data.lineId) this.armed.add(String(data.lineId));
    if (event.type === 'BORE_INSTALL_COMPLETED' && data.boreId) this.armed.add(String(data.boreId));
    if (event.type === 'ENGINEER_INSTALL_COMPLETED' && data.kind === 'FREIGHT_INSTALL') this.armed.add('FREIGHT');
    if (event.type === 'AUTO_SWING_TRIGGER' && this.armed.has('AUTO_SWING')) this.autoNode = String(data.nodeId);
    if (event.type === 'MINER_SWING_START' && !data.crewId && data.nodeId !== this.autoNode) this.autoNode = null;
    if (event.type === 'PLAYER_INPUT_MINE' || event.type === 'PLAYER_INPUT_MOVE') this.autoNode = null;
    if (event.type === 'AUTO_DISPATCH_TRIGGER' && this.armed.has('AUTO_DISPATCH')) this.autoShipment = String(data.shipmentId);
    const actor = String(data.crewId ?? data.actor ?? 'PLAYER');
    const local = !state.run.elevator.travel && (!data.depth || data.depth === state.run.depth.current);
    const hit = event.type === 'MINER_SWING_HIT' && Number(data.damage) > 0 && !data.boreId;
    const pickup = event.type === 'CARGO_TRANSFERRED' && data.stage === 'PICKUP' && Number(data.items) > 0;
    const point = this.point(state, actor);
    if (local) for (const pending of this.gear.values()) {
      if (pending.target !== actor || !this.equipped(pending, state)) continue;
      const used = pending.slot === 'TOOL' ? hit && !pending.loadedOnly
        : pending.slot === 'PACK' ? pickup : pending.slot === 'LAMP' ? event.type === 'NODE_BREAK' && !data.boreId : false;
      if (!used) continue;
      const detail = pending.slot === 'TOOL' ? `FIRST HIT · ${data.damage} DAMAGE`
        : pending.slot === 'PACK' ? `FIRST LOAD · ${state.run.character.backpackCapacity} KG CAPACITY`
          : `FIRST SURVEY · ROCK OPENED`;
      result.push(this.notice(pending.key, pending.name, detail, state, point));
      this.gear.delete(`${pending.target}:${pending.slot}`);
    }
    const complete = (key: string, label: string, detail: string, global = false) => {
      if (!this.armed.has(key) || this.seen.has(`auto:${key}`) || (!local && !global)) return;
      this.armed.delete(key);
      result.push(this.notice(`auto:${key}`, label, detail, state, global ? null : point));
    };
    if (hit && actor === 'PLAYER' && data.nodeId === this.autoNode) {
      complete('AUTO_SWING', 'AUTO SWING WORKING', `FIRST AUTOMATIC HIT · ${data.damage} DAMAGE`); this.autoNode = null;
    }
    if (event.type === 'PORTER_DEPOSIT' && Number(data.items) > 0) complete('PORTER', 'PORTER WORKING', 'FIRST LOAD DELIVERED TO THE LIFT');
    if (event.type === 'NODE_BREAK' && data.crewId) complete(String(data.crewId), 'MINER WORKING', 'FIRST ROCK BROKEN');
    if (event.type === 'FLOOR_CARGO_DEPOSITED' && Number(data.items) > 0) complete(String(data.crewId), 'PORTER WORKING', 'FIRST LOAD DELIVERED TO FLOOR CARGO');
    if (event.type === 'RAIL_CARGO_UNLOADED' && Number(data.items) > 0)
      complete(String(data.lineId), 'RAIL LINE WORKING', `${data.depth} · FIRST LOAD DELIVERED`, true);
    if (event.type === 'BORE_OUTPUT') complete(String(data.boreId), 'BORE WORKING', `${data.depth} · FIRST PHYSICAL OUTPUT`, true);
    if (event.type === 'FREIGHT_APPRAISED') complete('FREIGHT', 'FREIGHT LIFT WORKING', 'FIRST FREIGHT SHIPMENT APPRAISED', true);
    if (event.type === 'SHIPMENT_APPRAISED' && data.shipmentId === this.autoShipment) {
      complete('AUTO_DISPATCH', 'AUTO DISPATCH WORKING', 'FIRST AUTOMATIC SHIPMENT APPRAISED', true); this.autoShipment = null;
    }
    return result;
  }

  /** Movement is acknowledged only after actual displacement, not an input or idle pose. */
  movement(state: GameState): RewardNotice | null {
    this.sync(state);
    if (state.run.elevator.travel || !['MOVING_TO_POINT', 'MOVING_TO_NODE', 'RETURNING'].includes(state.run.character.state)) return null;
    for (const pending of this.gear.values()) {
      if (pending.target !== 'PLAYER' || (pending.slot !== 'BOOTS' && !pending.loadedOnly) || !this.equipped(pending, state)) continue;
      if (pending.loadedOnly && !state.run.character.carried.length) { pending.x = state.run.character.x; continue; }
      if (Math.abs(state.run.character.x - pending.x) < 4) continue;
      this.gear.delete(`${pending.target}:${pending.slot}`);
      return this.notice(pending.key, pending.name, `${pending.loadedOnly ? 'LOADED WALK' : 'FIRST WALK'} · ${Math.round(getModifiers(state).playerMoveSpeed)} PX/S`, state, this.point(state, 'PLAYER'));
    }
    return null;
  }

  private equipped(pending: PendingGear, state: GameState): boolean {
    if (pending.id === null) return pending.target === 'PLAYER';
    return pending.target === 'PLAYER' ? state.run.phase5.equipment.equippedPlayer[pending.slot] === pending.id
      : Object.values(state.run.phase5.crew.members.find(member => member.id === pending.target)?.equipment ?? {}).includes(pending.id);
  }

  private point(state: GameState, actor: string): { x: number; y: number } {
    const body = actor === 'PLAYER' ? state.run.character : actor === 'PORTER' ? state.run.porter
      : state.run.phase5.crew.members.find(member => member.id === actor)?.body ?? state.run.character;
    return { x: Math.round(body.x), y: Math.round(body.y) - 16 + (state.run.depth.current === 'D-001' ? 13 : 0) };
  }

  private notice(key: string, label: string, detail: string, state: GameState, point: { x: number; y: number } | null): RewardNotice {
    this.seen.add(key); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    return { key, label, detail, effect: 'work', priority: 2, duration: 1400,
      ...(point ? { work: { ...point, depth: state.run.depth.current } } : {}) };
  }
}
