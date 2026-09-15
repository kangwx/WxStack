export interface UITransition {
  duration: number;
  reducedMotion?: boolean;
  onProgress(progress: number): void;
  onComplete?(): void;
  onCancel?(): void;
}
interface ActiveTransition { spec: UITransition; elapsed: number; duration: number }

/** Owns only transition timing and input locking. Visual styles and game commands remain with callers. */
export class UITransitionController {
  private active: ActiveTransition | null = null;
  private disposed = false;
  constructor(private readonly setInputLocked: (locked: boolean) => void) {}
  get running(): boolean { return this.active !== null; }

  begin(spec: UITransition): boolean {
    if (this.disposed || this.active) return false;
    const duration = spec.reducedMotion || !Number.isFinite(spec.duration) ? 0 : Math.max(0, spec.duration);
    const transition = { spec, duration, elapsed: 0 };
    this.active = transition;
    try {
      this.setInputLocked(true);
      spec.onProgress(0);
      if (this.active === transition && duration === 0) this.finish();
    } catch (error) { this.release(transition); throw error; }
    return true;
  }

  step(dt: number): void {
    const transition = this.active;
    if (!transition || !Number.isFinite(dt) || dt <= 0) return;
    transition.elapsed += dt;
    const progress = transition.duration === 0 ? 1 : Math.min(1, transition.elapsed / transition.duration);
    try {
      transition.spec.onProgress(progress);
      if (this.active === transition && progress === 1) {
        this.release(transition);
        transition.spec.onComplete?.();
      }
    } catch (error) { this.release(transition); throw error; }
  }

  /** Resize/background recovery settles to the final visual state and completes exactly once. */
  finish(): void {
    const transition = this.active;
    if (!transition) return;
    try {
      transition.spec.onProgress(1);
      if (this.active === transition) {
        this.release(transition);
        transition.spec.onComplete?.();
      }
    } catch (error) { this.release(transition); throw error; }
  }

  cancel(): void {
    const transition = this.active;
    if (!transition) return;
    this.release(transition);
    transition.spec.onCancel?.();
  }

  dispose(): void { this.disposed = true; this.cancel(); }

  private release(transition: ActiveTransition): void {
    if (this.active !== transition) return;
    this.active = null;
    this.setInputLocked(false);
  }
}
