import { useEffect, useRef } from 'react';
import { useGameRuntime } from '../../app/GameProvider';

export function GameCanvas() {
  const runtime = useGameRuntime();
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
      tabIndex={0}
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
