import { inspectedNode } from '../fieldUi';
import { nodeSurvey, nodeTripEstimate } from '../mining';
import { cargoValue, cargoWeight, currentFloor } from '../simulation';
import { shipmentStatus } from '../elevatorUi';
import type { GameState, LootStack } from '../types';
import { information, number, type ManagementState, type StationItem, type StationView } from './types';

/** Read-only field notes reuse the existing paged Canvas window and keyboard navigation. */
export function surveyView(state: GameState, ui: ManagementState): StationView {
  const floor = currentFloor(state);
  const load = (id: string, name: string, items: LootStack[], total: number): StationItem => {
    const weight = cargoWeight(items);
    return { ...information(id, name, `${number(weight)}/${total} kg · EST ${cargoValue(items)} Scrap`, [
      ...(id === 'backpack' ? ['Carry ore to the lift to unload. A full bag does not stop mining.'] : [shipmentStatus(state)]),
      ...items.map(item => `${item.name}${item.quality ? ` · ${item.quality}` : ''}: ${number(item.weight)} kg · ${item.value} Scrap`),
      ...(!items.length ? ['Empty'] : []),
    ]), progress: { value: weight, total, label: 'Capacity' } };
  };
  return { title: 'FIELD NOTES', tabs: [{ id: 'veins', label: 'VEINS' }, { id: 'cargo', label: 'CARGO' }],
    items: ui.tab === 'cargo' ? [load('backpack', 'Backpack', state.run.character.carried, state.run.character.backpackCapacity),
      load('lift', 'Lift cargo', state.run.elevator.cargo, state.run.elevator.maxLoad)]
      : floor.nodes.map(node => {
        const trip = nodeTripEstimate(state, node);
        return { ...information(node.id, node.name, node.access === 'REMOTE_ONLY' ? 'No walkway · remote equipment required' : 'Mining vein', [
          `HP ${node.hp}/${node.maxHp}${node.hp <= 0 ? ` · Returns in ${Math.ceil(node.respawnTimer)}s` : ''}`,
          ...nodeSurvey(state, floor, node).split(' · '),
          `Haul about ${trip.walkSeconds.toFixed(1)}s round trip; average ore ${trip.averageWeight.toFixed(1)}kg`,
          'Ordinary ore returns. Revealed discoveries and Core reserves are finite within this Run.',
        ]), progress: node.hp > 0 ? { value: node.hp, total: node.maxHp, label: 'Rock remaining' } : undefined };
      }) };
}

export function surveyRequest(state: GameState) {
  return { station: 'survey' as const, tab: 'veins', selectedId: inspectedNode(state)?.id };
}
