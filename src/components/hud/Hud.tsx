import { useGameState } from '../../app/GameProvider';
import { RESEARCH } from '../../game/config';
import { phase5Floor } from '../../game/phase5';
import { cargoWeight, carriedWeight } from '../../game/simulation';
import { fmt, formatState } from '../shared/format';

export function ResourceHud() {
  const state = useGameState();
  const run = state.run;
  const floor = phase5Floor(state, run.depth.current);
  const line = run.logistics.lines.find((candidate) => candidate.depth === run.depth.current);
  const hub = run.logistics.cargoHubs.find((candidate) => candidate.depth === run.depth.current);
  const bore = run.deepAutomation.bores.find((candidate) => candidate.depth === run.depth.current);

  return (
    <div className="hud hud-left">
      <strong>SCRAP {run.scrap}</strong> · <strong>DATA {run.data}</strong> · <strong>CORE {state.meta.core}</strong><br />
      <span className="muted">CARRY</span> {fmt(carriedWeight(state))}/{fmt(run.character.backpackCapacity)}kg ·{' '}
      <span className="muted">LIFT</span> {fmt(cargoWeight(run.elevator.cargo))}/{fmt(run.elevator.maxLoad)}kg
      {run.phase5.crew.unlocked && <><br /><span className="muted">SHIFT</span> {run.phase5.crew.members.length}/{run.phase5.crew.slots} · <span className="muted">FLOOR</span> {fmt(cargoWeight(floor.cargo))}kg</>}
      {line && <><br /><span className="muted">LINE</span> {fmt(cargoWeight(line.inputBuffer))}/{fmt(line.maxInputWeight)}kg · {formatState(line.state)}</>}
      {hub && <> · <span className="muted">HUB</span> {fmt(cargoWeight(hub.buffer))}/{fmt(hub.maxWeight)}kg</>}
      {bore && <><br /><span className="muted">BORE</span> {formatState(bore.state)} · OUT {fmt(cargoWeight(bore.outputBuffer))}/{fmt(bore.maxOutputWeight)}kg</>}
    </div>
  );
}

export function RunStatusHud() {
  const state = useGameState();
  const run = state.run;
  const freight = run.logistics.freightCage;
  const engineer = run.engineer;
  const shallow = run.depth.current === 'D-001';
  const showResearch = !shallow || run.depth.unlocked.includes('D-060')
    || run.research.active !== null || run.research.completed.length > 0;

  return (
    <div className="hud hud-right" data-depth={run.depth.current}>
      <strong>RUN {String(state.meta.runIndex).padStart(2, '0')} · {run.depth.current}</strong>
      {showResearch && <><br /><span className="muted">RESEARCH</span> {run.research.active ? RESEARCH[run.research.active.id].name : `${run.research.completed.length}/${Object.keys(RESEARCH).length}`}</>}
      {(!shallow || engineer.unlocked) && <><br /><span className="muted">ENGINEER</span> {engineer.unlocked ? formatState(engineer.state) : 'LOCKED'}</>}
      {(!shallow || freight.state !== 'UNBUILT') && <><br /><span className="muted">FREIGHT</span> {formatState(freight.state)}{freight.cargo.length > 0 && ` · ${fmt(cargoWeight(freight.cargo))}kg`}</>}
      {(!shallow || state.meta.bestDepth !== run.depth.current) && <><br /><span className="muted">BEST</span> {state.meta.bestDepth}</>}
    </div>
  );
}
