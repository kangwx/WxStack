import type { ReviveSession } from '../ReviveClient';

export interface ReviveClientPort {
  create(): Promise<ReviveSession>;
  status(session: ReviveSession): Promise<{ state: string }>;
  consume(session: ReviveSession): Promise<{ state: string }>;
  cancel(session: ReviveSession): Promise<unknown>;
}
export interface ReviveScheduler {
  schedule(callback: () => void, intervalSeconds: number): void;
  unschedule(callback: () => void): void;
}
export interface ReviveContext { roundId: string; isValid: boolean; canRevive: boolean }
export type ReviveStatus = 'closed' | 'creating' | 'waiting' | 'retrying' | 'expired' | 'error';
export interface ReviveViewState {
  readonly status: ReviveStatus;
  readonly session: Readonly<ReviveSession> | null;
  readonly secondsRemaining: number | null;
  readonly message: string;
}
export interface ReviveControllerOptions {
  client: ReviveClientPort;
  scheduler: ReviveScheduler;
  getContext(): ReviveContext;
  onState(state: Readonly<ReviveViewState>): void;
  onConfirmed(roundId: string): void;
  now?: () => number;
}

/** Owns one modal's network lifecycle. It never awards currency, spends stamina or resets the game. */
export class ReviveController {
  private viewState: Readonly<ReviveViewState> = Object.freeze({
    status: 'closed', session: null, secondsRemaining: null, message: '',
  });
  private session: ReviveSession | null = null;
  private version = 0;
  private roundId = '';
  private confirmedRoundId = '';
  private pollingVersion: number | null = null;
  private scheduled = false;
  private disposed = false;
  private readonly now: () => number;
  private readonly tick = (): void => { void this.poll(); };

  constructor(private readonly options: ReviveControllerOptions) { this.now = options.now ?? Date.now; }
  get state(): Readonly<ReviveViewState> { return this.viewState; }
  get visible(): boolean { return this.viewState.status !== 'closed'; }

  async open(): Promise<boolean> {
    const context = this.options.getContext();
    if (this.disposed || this.visible || !context.isValid || !context.canRevive
      || context.roundId === this.confirmedRoundId) return false;
    const version = ++this.version;
    const roundId = this.roundId = context.roundId;
    this.setState('creating', null, null, '正在生成二维码…');
    try {
      const session = await this.options.client.create();
      if (!this.current(version, roundId)) { this.cancelSession(session); return false; }
      this.session = session;
      if (this.now() >= session.expiresAt) this.expire();
      else {
        this.setState('waiting', session, this.remaining(session), '请用同一网络的手机扫码\n在手机上点击「确认复活」');
        // A view callback can synchronously navigate away; do not leave a timer behind.
        if (this.current(version, roundId)) {
          this.scheduled = true;
          this.options.scheduler.schedule(this.tick, 1);
        }
      }
      return this.current(version, roundId);
    } catch (error) {
      if (!this.current(version, roundId)) return false;
      this.setState('error', null, null, `${this.errorMessage(error)}\n请返回结算后重试`);
      return true;
    }
  }

  close(): void {
    ++this.version;
    this.stopPolling();
    this.pollingVersion = null;
    const session = this.session;
    this.session = null;
    this.roundId = '';
    if (this.visible) this.setState('closed', null, null, '', !this.disposed);
    if (session) this.cancelSession(session);
  }

  async poll(): Promise<void> {
    const session = this.session;
    const version = this.version;
    const roundId = this.roundId;
    if (!session || !this.visible || this.disposed || this.pollingVersion === version) return;
    if (!this.current(version, roundId)) { this.close(); return; }
    if (this.now() >= session.expiresAt) { this.expire(); return; }
    this.pollingVersion = version;
    try {
      let result = await this.options.client.status(session);
      if (!this.current(version, roundId)) return;
      if (result.state === 'confirmed') result = await this.options.client.consume(session);
      if (!this.current(version, roundId)) return;
      if (result.state === 'consumed') {
        // Server-consumed also reconciles a consume request whose successful response was lost.
        this.confirmedRoundId = roundId;
        this.close();
        const context = this.options.getContext();
        if (!this.disposed && context.isValid && context.canRevive && context.roundId === roundId) {
          this.options.onConfirmed(roundId);
        }
      } else if (this.now() >= session.expiresAt) this.expire();
      else {
        const seconds = this.remaining(session);
        const countdown = `${Math.floor(seconds / 60)}:${(`0${seconds % 60}`).slice(-2)}`;
        this.setState('waiting', session, seconds, `手机扫码后点击「确认复活」\n二维码 ${countdown} 后过期`);
      }
    } catch (error) {
      if (!this.current(version, roundId)) return;
      if (this.now() >= session.expiresAt) this.expire();
      else this.setState('retrying', session, this.remaining(session),
        `${this.errorMessage(error)}\n正在重试，也可以返回结算`);
    } finally {
      // An old request must never reset the in-flight guard of a newly opened session.
      if (this.pollingVersion === version) this.pollingVersion = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.close();
  }

  private current(version: number, roundId: string): boolean {
    if (this.disposed || version !== this.version || roundId !== this.roundId || !this.visible) return false;
    const context = this.options.getContext();
    return context.isValid && context.canRevive && context.roundId === roundId;
  }

  private expire(): void {
    this.stopPolling();
    this.setState('expired', null, 0, '二维码已过期\n请返回结算后重新扫码');
  }

  private remaining(session: ReviveSession): number {
    return Math.max(0, Math.ceil((session.expiresAt - this.now()) / 1000));
  }

  private stopPolling(): void {
    if (!this.scheduled) return;
    this.scheduled = false;
    this.options.scheduler.unschedule(this.tick);
  }

  private cancelSession(session: ReviveSession): void {
    try { void this.options.client.cancel(session).catch(() => {}); }
    catch { /* Best-effort cancellation must never prevent closing the modal. */ }
  }

  private setState(status: ReviveStatus, session: ReviveSession | null, secondsRemaining: number | null,
    message: string, notify = true): void {
    const previous = this.viewState;
    if (previous.status === status && previous.session === session
      && previous.secondsRemaining === secondsRemaining && previous.message === message) return;
    this.viewState = Object.freeze({ status, session, secondsRemaining, message });
    if (notify) this.options.onState(this.viewState);
  }

  private errorMessage(error: unknown): string {
    const message = (error as { message?: unknown })?.message;
    return typeof message === 'string' && message ? message : '复活服务暂不可用';
  }
}
