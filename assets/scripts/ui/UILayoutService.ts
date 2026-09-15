export interface UIViewport {
  width: number; height: number;
  frameWidth?: number; frameHeight?: number;
  safeTop?: number; safeRight?: number; safeBottom?: number; safeLeft?: number;
  pixelRatio?: number;
}
export interface UILayoutMetrics {
  width: number; height: number; frameWidth: number; frameHeight: number;
  safeTop: number; safeRight: number; safeBottom: number; safeLeft: number; pixelRatio: number;
}
const METRIC_KEYS: ReadonlyArray<keyof UILayoutMetrics> = [
  'width', 'height', 'frameWidth', 'frameHeight', 'safeTop', 'safeRight', 'safeBottom', 'safeLeft', 'pixelRatio',
];

/** Invoked from viewport/safe-area events; duplicate events never repeat layout work. */
export class UILayoutService {
  private previous: Readonly<UILayoutMetrics> | null = null;
  private disposed = false;
  constructor(private readonly apply: (metrics: Readonly<UILayoutMetrics>) => void) {}
  get current(): Readonly<UILayoutMetrics> | null { return this.previous; }

  update(viewport: UIViewport): boolean {
    if (this.disposed || !this.positive(viewport.width) || !this.positive(viewport.height)) return false;
    const next: UILayoutMetrics = {
      width: viewport.width, height: viewport.height,
      frameWidth: viewport.frameWidth ?? viewport.width, frameHeight: viewport.frameHeight ?? viewport.height,
      safeTop: viewport.safeTop ?? 0, safeRight: viewport.safeRight ?? 0,
      safeBottom: viewport.safeBottom ?? 0, safeLeft: viewport.safeLeft ?? 0,
      pixelRatio: viewport.pixelRatio ?? 1,
    };
    if (!this.positive(next.frameWidth) || !this.positive(next.frameHeight) || !this.positive(next.pixelRatio)
      || !this.inset(next.safeTop) || !this.inset(next.safeRight)
      || !this.inset(next.safeBottom) || !this.inset(next.safeLeft)) return false;
    if (this.previous && METRIC_KEYS.every(key => next[key] === this.previous![key])) return false;
    const snapshot = Object.freeze(next);
    // Commit only after success so a transient rendering failure can be retried by the same event.
    this.apply(snapshot);
    this.previous = snapshot;
    return true;
  }

  dispose(): void { this.disposed = true; this.previous = null; }
  private positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
  private inset(value: number): boolean { return Number.isFinite(value) && value >= 0; }
}
