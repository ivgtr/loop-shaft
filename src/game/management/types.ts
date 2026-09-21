import type { GameCommand } from '../../runtime/commands';
import type { DepthId, EquipmentSlot, LootCategory, Selection } from '../types';

export type Station = 'facilities' | 'equipment' | 'research' | 'crew' | 'archive' | 'scanner' | 'core' | 'reboot' | 'logistics';
export interface StationRequest { station: Station; tab?: string; subjectId?: string; selectedId?: string; }
/** Transient navigation only. Never part of the v6 save. */
export interface ManagementState {
  station: Station; tab: string; subjectId: string | null; selectedId: string;
  detailPage: number; detailsOpen: boolean; optionId: string | null;
  confirmation: string | null; notice: string | null;
  runIndex: number; depth: DepthId; returnSelection: Selection;
}
export type StationAction = { type: 'workshop' } | { type: 'command'; command: GameCommand } | { type: 'navigate'; request: StationRequest };
export interface DecisionFact { label: string; value: string; warning?: boolean; }
export interface EquipmentMetric { label: string; before: number; after: number; unit?: string; }
export interface EquipmentPreview {
  slot: EquipmentSlot; current: string; candidate: string;
  metrics: EquipmentMetric[]; gained: string[]; lost: string[];
}
export interface RouteStop { label: string; detail: string; blocked: boolean; }
export interface StationOption { id: string; label: string; active: boolean; selected: boolean; }
export interface CrewRow { id: string; name: string; location: string; task: string; priority: string; }
export interface StationItem {
  id: string; name: string; summary: string; lines: string[];
  reason: string | null; actionLabel: string; action: StationAction | null;
  active?: boolean; badge?: string; listDetail?: string;
  /** Essential consequences are always visible, including while reading extra details. */
  decision?: { facts: DecisionFact[]; confirmLabel: string; cancelLabel: string; closeOnCancel?: boolean; };
  equipment?: EquipmentPreview;
  progress?: { value: number; total: number; label: string; };
  discovery?: { category: LootCategory; discovered: boolean; };
  route?: RouteStop[];
  options?: StationOption[];
  /** Only payload-affecting state belongs here; clocks must not cancel confirmation. */
  confirmKey?: string;
}
export interface StationTab { id: string; label: string; }
export interface StationView {
  title: string; tabs: StationTab[]; items: StationItem[]; back?: StationRequest | 'workshop';
  roster?: CrewRow[];
  gallery?: boolean;
  running?: { name: string; value: number; total: number; remaining: number; };
}
export function information(id: string, name: string, summary: string, lines: string[] = []): StationItem {
  return { id, name, summary, lines, reason: null, actionLabel: 'INFORMATION', action: null };
}
export function commandAction(command: GameCommand): StationAction { return { type: 'command', command }; }
export function number(value: number): string { return Number(value.toFixed(2)).toString(); }
