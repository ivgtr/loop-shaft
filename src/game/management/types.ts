import type { GameCommand } from '../../runtime/commands';
import type { DepthId, Selection } from '../types';

export type Station = 'facilities' | 'equipment' | 'research' | 'crew' | 'archive' | 'scanner' | 'core' | 'reboot' | 'logistics';
export interface StationRequest { station: Station; tab?: string; subjectId?: string; selectedId?: string; }
/** Transient navigation only. Never part of the v6 save. */
export interface ManagementState {
  station: Station; tab: string; subjectId: string | null; selectedId: string;
  detailPage: number; confirmation: string | null; notice: string | null;
  runIndex: number; depth: DepthId; returnSelection: Selection;
}
export type StationAction = { type: 'workshop' } | { type: 'command'; command: GameCommand } | { type: 'navigate'; request: StationRequest };
export interface StationItem {
  id: string; name: string; summary: string; lines: string[];
  reason: string | null; actionLabel: string; action: StationAction | null;
  active?: boolean;
  /** Only payload-affecting state belongs here; clocks must not cancel confirmation. */
  confirmKey?: string;
}
export interface StationTab { id: string; label: string; }
export interface StationView { title: string; tabs: StationTab[]; items: StationItem[]; back?: StationRequest | 'workshop'; }
export function information(id: string, name: string, summary: string, lines: string[] = []): StationItem {
  return { id, name, summary, lines, reason: null, actionLabel: 'INFORMATION', action: null };
}
export function commandAction(command: GameCommand): StationAction { return { type: 'command', command }; }
export function number(value: number): string { return Number(value.toFixed(2)).toString(); }
