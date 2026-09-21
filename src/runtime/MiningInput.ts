import { MINE_INPUT_BUFFER, miningTarget } from '../game/playerControls';
import { canRequestMine, requestMine } from '../game/simulation';
import type { DepthId, GameState } from '../game/types';

/** One short, target-bound input buffer, shared by pointer, button and keyboard. */
export class MiningInput {
  private pending: { nodeId: string; depth: DepthId; run: number; expiresAt: number } | null = null;

  constructor(private readonly state: GameState) {}

  request(nodeId?: string): boolean {
    const node = miningTarget(this.state, nodeId);
    if (!node) return false;
    if (requestMine(this.state, node.id)) {
      this.cancel();
      return true;
    }
    if (!canRequestMine(this.state, node.id)) return false;
    this.pending = {
      nodeId: node.id,
      depth: this.state.run.depth.current,
      run: this.state.meta.runIndex,
      expiresAt: this.state.elapsed + MINE_INPUT_BUFFER,
    };
    return true;
  }

  update(): void {
    const pending = this.pending;
    if (!pending) return;
    if (this.state.elapsed > pending.expiresAt + 0.000001
      || this.state.run.depth.current !== pending.depth
      || this.state.meta.runIndex !== pending.run
      || this.state.run.character.targetNodeId !== pending.nodeId
      || !miningTarget(this.state, pending.nodeId)) {
      this.cancel();
      return;
    }
    if (requestMine(this.state, pending.nodeId)) this.cancel();
  }

  cancel(): void { this.pending = null; }
}
