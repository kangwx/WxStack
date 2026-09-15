export type BaseScreen = 'home' | 'gameplay' | 'result';
export type OverlayScreen = 'settings' | 'leaderboard' | 'pause' | 'nickname' | 'revive';
export interface RouteEntry { screen: OverlayScreen; returnFocus: number }

/** Navigation state is independent of persistent game state. */
export class UIRouter {
  base: BaseScreen = 'home';
  private overlays: RouteEntry[] = [];
  transitionLocked = false;
  get top(): BaseScreen | OverlayScreen { return this.overlays[this.overlays.length - 1]?.screen ?? this.base; }
  get depth(): number { return this.overlays.length; }
  reset(base: BaseScreen): void { this.base = base; this.overlays.length = 0; }
  push(screen: OverlayScreen, returnFocus = 0): boolean {
    return this.transitionLocked ? false : this.commitPush(screen, returnFocus);
  }
  /** Apply an already accepted navigation command at its transition midpoint. */
  commitPush(screen: OverlayScreen, returnFocus = 0): boolean {
    if (this.has(screen)) return false;
    this.overlays.push({ screen, returnFocus });
    return true;
  }
  pop(): RouteEntry | undefined { return this.transitionLocked ? undefined : this.commitPop(); }
  /** Commit the accepted close command while external navigation remains locked. */
  commitPop(): RouteEntry | undefined { return this.overlays.pop(); }
  has(screen: OverlayScreen): boolean { return this.overlays.some(entry => entry.screen === screen); }
}
