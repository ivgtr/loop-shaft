import { createContext, useContext, useSyncExternalStore, type PropsWithChildren } from 'react';
import type { GameState } from '../game/types';
import { GameRuntime } from '../runtime/GameRuntime';

const GameRuntimeContext = createContext<GameRuntime | null>(null);

export function GameProvider({ runtime, children }: PropsWithChildren<{ runtime: GameRuntime }>) {
  return <GameRuntimeContext.Provider value={runtime}>{children}</GameRuntimeContext.Provider>;
}

export function useGameRuntime(): GameRuntime {
  const runtime = useContext(GameRuntimeContext);
  if (!runtime) throw new Error('GameProvider is missing.');
  return runtime;
}

export function useGameSnapshot() {
  const runtime = useGameRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}

export function useGameState(): GameState { return useGameSnapshot().state; }
