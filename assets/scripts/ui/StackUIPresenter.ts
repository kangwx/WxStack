/** Coalesces event-driven changes for one page. Hidden pages do not read or render state. */
export class StackUIPresenter<T> {
  private dirty = true;
  private visible = false;
  private disposed = false;

  constructor(private readonly readSnapshot: () => Readonly<T>,
    private readonly renderSnapshot: (snapshot: Readonly<T>) => void) {}

  get pending(): boolean { return this.dirty && !this.disposed; }
  get isVisible(): boolean { return this.visible; }

  setVisible(visible: boolean): void {
    if (this.disposed || visible === this.visible) return;
    this.visible = visible;
    if (visible) this.dirty = true;
  }

  invalidate(): void { if (!this.disposed) this.dirty = true; }

  /** Call at the end of a command/event batch or once from the game's frame, never from each setter. */
  flush(): boolean {
    if (this.disposed || !this.visible || !this.dirty) return false;
    // A change caused by rendering is retained for the next flush rather than recursively rendering.
    this.dirty = false;
    try { this.renderSnapshot(this.readSnapshot()); }
    catch (error) { this.dirty = true; throw error; }
    return true;
  }

  dispose(): void { this.disposed = true; this.dirty = false; this.visible = false; }
}
