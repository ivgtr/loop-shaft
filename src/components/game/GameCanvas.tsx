import { useEffect, useRef } from 'react';
import { useGameRuntime, useGameState } from '../../app/GameProvider';
import { carriedWeight, currentFloor } from '../../game/simulation';

export function GameCanvas() {
  const runtime = useGameRuntime();
  const state = useGameState();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    runtime.attachCanvas(canvas);
    return () => runtime.detachCanvas(canvas);
  }, [runtime]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      aria-label="LOOP SHAFT mining floor"
      aria-describedby="player-control-help"
      tabIndex={0}
      data-player-x={state.run.character.x.toFixed(2)}
      data-player-state={state.run.character.state}
      data-swing={state.run.character.swing ? 'active' : 'ready'}
      data-carried-weight={carriedWeight(state).toFixed(2)}
      data-floor-loot={currentFloor(state).loot.length}
      data-elevator-state={state.run.elevator.state}
      onBlur={() => runtime.releaseInputs()}
      onPointerCancel={() => runtime.releaseInputs()}
      onPointerDown={() => runtime.unlockAudio()}
      onPointerMove={(event) => {
        if (event.pointerType === 'touch') runtime.clearCanvasPointer();
        else runtime.updateCanvasPointer(event.clientX, event.clientY);
      }}
      onPointerLeave={() => runtime.clearCanvasPointer()}
      onClick={(event) => {
        runtime.selectCanvasTarget(event.clientX, event.clientY);
        event.currentTarget.focus({ preventScroll: true });
      }}
    />
  );
}
