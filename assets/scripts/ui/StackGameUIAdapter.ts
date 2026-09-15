export interface GameUIState {
  phase: string; score: number; bestScore: number; coins: number;
  testMode: boolean; reducedMotion: boolean; soundEnabled: boolean;
  nickname: string; stamina: number; staminaNextAt: number | null;
}
export interface GameUICommands {
  startRound(): void; pauseRound(): void; resumeRound(): void;
  restartRound(): void; returnHome(): void;
}
export interface Subscription { dispose(): void }
const STATE_KEYS: ReadonlyArray<keyof GameUIState> = [
  'phase', 'score', 'bestScore', 'coins', 'testMode', 'reducedMotion', 'soundEnabled',
  'nickname', 'stamina', 'staminaNextAt',
];

/** Commands stay with the game. Subscribers receive state only when it changes. */
export class StackGameUIAdapter {
  private listeners = new Map<(state: Readonly<GameUIState>) => void, Readonly<GameUIState>>();
  private previous: Readonly<GameUIState> | null = null;
  private disposed = false;
  constructor(private readonly read: () => GameUIState, readonly commands: GameUICommands) {}
  subscribe(listener: (state: Readonly<GameUIState>) => void): Subscription {
    if (this.disposed) throw new Error('[StackGameUIAdapter] Adapter has been disposed');
    const snapshot = this.snapshot();
    this.listeners.set(listener, snapshot);
    if (!this.previous) this.previous = snapshot;
    try { listener(snapshot); }
    catch (error) { this.listeners.delete(listener); throw error; }
    return { dispose: () => this.listeners.delete(listener) };
  }
  publish(): void {
    if (this.disposed) return;
    const state = this.snapshot();
    if (this.previous && this.equal(state, this.previous)) return;
    this.previous = state;
    for (const [listener, lastState] of this.listeners) {
      if (this.equal(state, lastState)) continue;
      this.listeners.set(listener, state);
      listener(state);
    }
  }
  dispose(): void { this.disposed = true; this.listeners.clear(); this.previous = null; }
  private snapshot(): Readonly<GameUIState> { return Object.freeze({ ...this.read() }); }
  private equal(a: Readonly<GameUIState>, b: Readonly<GameUIState>): boolean {
    return STATE_KEYS.every(key => a[key] === b[key]);
  }
}
