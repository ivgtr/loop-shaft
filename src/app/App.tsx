import { useEffect } from 'react';
import { ContextPanel } from '../components/context/ContextPanel';
import { GameCanvas } from '../components/game/GameCanvas';
import { PlayerActions } from '../components/game/PlayerActions';
import { ResourceHud, RunStatusHud } from '../components/hud/Hud';
import { WorkshopCanvas } from '../components/workshop/WorkshopCanvas';
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
            <ResourceHud />
            <RunStatusHud />
            <WorkshopCanvas />
          </div>
          <LegacyControls />
        </div>
      </div>
    </GameProvider>
  );
}

/** Later UI stages migrate these controls; the workshop does not duplicate them. */
function LegacyControls() {
  const { workshop } = useGameSnapshot();
  return (
    <div className="legacy-controls" inert={workshop !== null}>
      <PlayerActions />
      <ContextPanel />
      <div className="help-line" id="player-control-help">
        <span><kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd> walk · <kbd>Space</kbd> mine · <kbd>E</kbd> interact · <kbd>F</kbd> send · <kbd>Esc</kbd> stop / close. Click floor to walk.</span>
        <span>Cargo stays physical. Choose when to pick up and return; payment happens at Surface.</span>
      </div>
    </div>
  );
}
