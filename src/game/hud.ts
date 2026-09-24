import { DEPTH_ORDER } from './depth';
import { nodeSurvey, nodeTripEstimate } from './mining';
import { elevatorItems } from './elevatorUi';
import { workshopGuide } from './workshop';
import { deriveInitialLogisticsGuide } from './initialLogisticsGuide';
import { miningTarget, playerInteraction } from './playerControls';
import { currentFloor, mineBlockReason } from './simulation';
import type { GameState } from './types';
import { t, type Locale } from '../i18n';
import { formatDisplay, localizeDisplayModel, displayText } from '../i18n/display';

/** Detailed readout for assistive technology and help, not the always-visible HUD. */
export function sceneReadout(state: GameState, locale: Locale = 'en') {
  const guide = deriveInitialLogisticsGuide(state);
  const goal = guide ? displayText(locale, guide.label) : nextObjective(state, locale);
  const selection = state.selection;
  const node = selection?.type === 'node'
    ? currentFloor(state).nodes.find((candidate) => candidate.id === selection.id) : miningTarget(state);
  const health = node ? node.hp > 0 ? `HP ${node.hp}/${node.maxHp}` : displayText(locale, `DEPLETED · ${Math.ceil(node.respawnTimer)}s`) : '';
  const action = playerInteraction(state);
  const reasonText = action.reason && action.type !== 'none' ? action.reason : mineBlockReason(state);
  const reason = reasonText ? displayText(locale, reasonText) : null;
  const survey = node ? displayText(locale, nodeSurvey(state, currentFloor(state), node)) : '';
  const trip = node ? nodeTripEstimate(state, node) : null;
  return localizeDisplayModel(locale, {
    survey,
    title: node ? displayText(locale, node.name) : `${state.run.depth.current} · ${t(locale, 'ui.shaft')}`,
    short: [node ? displayText(locale, node.name) : '', health, reason ?? displayText(locale, 'READY TO MINE')].filter(Boolean).join(' · '),
    detail: [survey, trip ? formatDisplay(locale, 'readout.trip', { seconds: trip.walkSeconds.toFixed(1), weight: trip.averageWeight.toFixed(1) }) : '',
      guide ? displayText(locale, guide.context) : goal, node ? displayText(locale, node.name) : '', health, reason].filter(Boolean).join(' · '),
    goal,
  });
}

/** Use the same live prerequisites as the lift, so completed objectives do not linger. */
export function nextObjective(state: GameState, locale: Locale = 'en'): string {
  const { run, meta } = state;
  const upgrade = workshopGuide(state);
  if (upgrade) return displayText(locale, upgrade.label);
  if (run.depth.current === 'D-650') return t(locale, 'objective.shaftEnd', { depth: 'D-650' });
  if (run.depth.current === 'D-100') {
    if (!run.pendingCore) return t(locale, 'objective.breakCore');
    if (meta.runIndex === 1) return t(locale, 'objective.keepCore');
  }
  const nextDepth = DEPTH_ORDER[DEPTH_ORDER.indexOf(run.depth.current) + 1];
  if (nextDepth && run.depth.unlocked.includes(nextDepth)) return t(locale, 'objective.travel', { depth: nextDepth });
  const connection = elevatorItems(state, 'extend').find((item) => item.id === nextDepth);
  if (connection) return connection.command ? t(locale, 'objective.liftAction', { action: displayText(locale, connection.actionLabel) })
    : t(locale, 'objective.connectionReason', { name: displayText(locale, connection.name), reason: displayText(locale, connection.reason ?? '') });
  return t(locale, 'objective.inspectConnection');
}
