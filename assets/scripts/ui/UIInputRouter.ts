/** One place to gate actions from pointer, browser, Android and gamepad sources. */
export class UIInputRouter {
  private held = new Set<number>();
  private lastAction = -Infinity;
  constructor(private readonly now: () => number = Date.now) {}
  keyDown(key: number, repeat = false): boolean {
    if (repeat || this.held.has(key)) return false;
    this.held.add(key); return true;
  }
  keyUp(key: number): void { this.held.delete(key); }
  clear(): void { this.held.clear(); this.lastAction = -Infinity; }
  acceptAction(locked: boolean, delayMs: number): boolean {
    const now = this.now();
    if (!Number.isFinite(now) || locked) return false;
    // A wall-clock correction must not leave controls disabled until the old time catches up.
    if (now >= this.lastAction && now - this.lastAction < Math.max(0, delayMs)) return false;
    this.lastAction = now; return true;
  }
  resetActionClock(): void { this.lastAction = this.now(); }
}
