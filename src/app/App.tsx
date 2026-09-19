import { useEffect } from 'react';
import { ContextPanel } from '../components/context/ContextPanel';
import { GameCanvas } from '../components/game/GameCanvas';
import { ResourceHud, RunStatusHud } from '../components/hud/Hud';
import type { GameRuntime } from '../runtime/GameRuntime';
import { GameProvider } from './GameProvider';

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
          </div>
          <ContextPanel />
          <div className="help-line">
            <span>Click / tap selects a vein or machine · <kbd>Space</kbd> mines when ready</span>
            <span>Cargo stays physical: mine → carry → line → vertical transport → Surface.</span>
          </div>
        </div>
      </div>
    </GameProvider>
  );
}
