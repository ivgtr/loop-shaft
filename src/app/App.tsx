import { useEffect } from 'react';
import { GameCanvas } from '../components/game/GameCanvas';
import { GameUiCanvas } from '../components/game/GameUiCanvas';
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
            <GameUiCanvas />
          </div>
        </div>
      </div>
    </GameProvider>
  );
}
