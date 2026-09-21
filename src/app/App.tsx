import { useEffect } from 'react';
import { ContextPanel } from '../components/context/ContextPanel';
import { GameCanvas } from '../components/game/GameCanvas';
import { GameUiCanvas } from '../components/game/GameUiCanvas';
import type { GameRuntime } from '../runtime/GameRuntime';
import { GameProvider, useGameSnapshot } from './GameProvider';

export function App({ runtime }: { runtime: GameRuntime }) {
  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, [runtime]);

  return (
    <GameProvider runtime={runtime}>
      <div className="game-root">
        <div>
          <div className="game-shell">
            <GameCanvas />
            <GameUiCanvas />
          </div>
          <LegacyControls />
        </div>
      </div>
    </GameProvider>
  );
}

/** Research, crew and deep logistics are the remaining third-stage UI. */
function LegacyControls() {
  const { workshop, elevatorUi, helpOpen } = useGameSnapshot();
  return (
    <div className="legacy-controls" inert={workshop !== null || elevatorUi !== null || helpOpen}>
      <ContextPanel />

    </div>
  );
}
