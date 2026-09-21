import { useRef, type MouseEvent, type PointerEvent, type PropsWithChildren } from 'react';
import { useGameRuntime, useGameState } from '../../app/GameProvider';
import { deriveInitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { miningTarget, playerControlAvailable, playerInteraction } from '../../game/playerControls';
import { canDispatchElevator, canRequestMine, cargoWeight, carriedWeight, mineBlockReason } from '../../game/simulation';
import type { GameCommand } from '../../runtime/commands';
import './playerControls.css';

function ControlButton({ command, label, shortcut, disabled = false, reason, className = '', children }: PropsWithChildren<{
  command: GameCommand; label: string; shortcut?: string; disabled?: boolean; reason?: string | null; className?: string;
}>) {
  const runtime = useGameRuntime();
  return <button type="button" className={`action ${className}`} aria-label={label} aria-keyshortcuts={shortcut}
    disabled={disabled} title={reason ?? label} onClick={(event: MouseEvent<HTMLButtonElement>) => {
      runtime.unlockAudio();
      runtime.dispatch(command);
      if (event.detail > 0) runtime.focusCanvas();
    }}>{children ?? label}</button>;
}

/** One owner per held pointer; cancellation also works when the finger leaves the button. */
function DirectionButton({ direction }: { direction: -1 | 1 }) {
  const runtime = useGameRuntime();
  const pointerId = useRef<number | null>(null);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    runtime.setPointerMovement(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <button type="button" className="action walk-control" aria-label={direction < 0 ? 'Walk left' : 'Walk right'}
    onPointerDown={(event) => {
      if (event.button !== 0 || pointerId.current !== null) return;
      event.preventDefault();
      runtime.unlockAudio();
      runtime.focusCanvas();
      pointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      runtime.setPointerMovement(direction);
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onBlur={() => { pointerId.current = null; runtime.setPointerMovement(0); }}
    onKeyDown={(event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) { runtime.unlockAudio(); runtime.setPointerMovement(direction); }
      }
    }}
    onKeyUp={(event) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); runtime.setPointerMovement(0); }
    }}
  >{direction < 0 ? '←' : '→'}</button>;
}

export function PlayerActions() {
  const state = useGameState();
  const target = miningTarget(state);
  const interaction = playerInteraction(state);
  const mineReason = mineBlockReason(state);
  const carried = carriedWeight(state);
  return <section className="player-actions" aria-label="Player controls">
    <div className="player-buttons">
      <DirectionButton direction={-1} /><DirectionButton direction={1} />
      <ControlButton command={{ type: 'mine' }} label="MINE" shortcut="Space" className="primary"
        disabled={!canRequestMine(state)} reason={mineReason}>MINE <kbd>Space</kbd></ControlButton>
      <ControlButton command={{ type: 'interact' }} label={interaction.label} shortcut="E"
        disabled={interaction.reason !== null} reason={interaction.reason}>{interaction.label} <kbd>E</kbd></ControlButton>
      <ControlButton command={{ type: 'return' }} label="RETURN" disabled={!playerControlAvailable(state) || carried === 0}
        reason={carried === 0 ? 'NO CARGO TO RETURN' : 'Walk to the lift and unload if it is available'} />
      <ControlButton command={{ type: 'cancel' }} label="CANCEL" shortcut="Escape">STOP <kbd>Esc</kbd></ControlButton>
    </div>
    <div className="player-readout">
      <span>PACK {carried.toFixed(1)}/{state.run.character.backpackCapacity}kg</span>
      <span>{target ? `${target.name} · ${mineReason ?? 'READY TO MINE'}` : mineReason}</span>
      {interaction.type !== 'none' && <span>{interaction.reason ?? `E · ${interaction.label}`}</span>}
    </div>
  </section>;
}

export function WorldControls() {
  const state = useGameState();
  const canSend = canDispatchElevator(state);
  const elevator = state.run.elevator;
  const interaction = playerInteraction(state);
  const showPrompt = !deriveInitialLogisticsGuide(state) && !elevator.travel && interaction.type !== 'none';
  const liftReason = canSend ? null : elevator.cargo.length === 0 ? 'NO LOADED CARGO' : elevator.state.replaceAll('_', ' ');
  return <>
    <div className="lift-action">
      <ControlButton command={{ type: 'send' }} label="SEND" shortcut="F" disabled={!canSend} reason={liftReason}>
        SEND <kbd>F</kbd>
      </ControlButton>
      <span>{cargoWeight(elevator.cargo).toFixed(1)}/{elevator.maxLoad}kg</span>
    </div>
    {showPrompt && <span className="player-prompt" style={{ left: `${Math.max(18, Math.min(82, state.run.character.x / 480 * 100))}%` }}>
      {interaction.reason ?? `E · ${interaction.label}`}
    </span>}
  </>;
}
