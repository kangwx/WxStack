import { AD_REWARD_CONFIG, AdEntryPoint, AdPendingAction } from '../RewardAdConfig';

export interface RewardAdState {
  open: boolean; entryPoint: AdEntryPoint | null; pendingAction: AdPendingAction | null;
  adUrl: string | null; sceneId: string | null; loading: boolean; errorMessage: string | null;
  pollStartedAt: number; countdownEndsAt: number; pollErrorCount: number;
}
export interface RewardAdPort {
  requestRewardAdUrl(entry: AdEntryPoint, options: { signal: AbortSignal }): Promise<{ adUrl: string; sceneId: string }>;
  queryRewardAdCompleted(sceneId: string, signal: AbortSignal): Promise<boolean>;
}
interface Options {
  client: RewardAdPort;
  render(state: Readonly<RewardAdState>): void;
  /** The game validates its captured round/page before granting this action. */
  grant(action: AdPendingAction): void;
  now?: () => number;
  poll?: typeof AD_REWARD_CONFIG.poll;
  timers?: { set(callback: () => void, ms: number): unknown; clear(id: unknown): void };
}
const initial = (): RewardAdState => ({ open: false, entryPoint: null, pendingAction: null, adUrl: null,
  sceneId: null, loading: false, errorMessage: null, pollStartedAt: 0, countdownEndsAt: 0,
  pollErrorCount: 0 });

/** One ad attempt at a time, with cancellation and automatic rewards after verified completion. */
export class RewardAdController {
  private value = initial();
  private generation = 0;
  private request: AbortController | null = null;
  private timer: unknown = null;
  private countdown: unknown = null;
  private disposed = false;
  private readonly now: () => number;
  private readonly policy: typeof AD_REWARD_CONFIG.poll;
  private readonly timers: NonNullable<Options['timers']>;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
    this.policy = options.poll ?? AD_REWARD_CONFIG.poll;
    this.timers = options.timers ?? { set: (callback, ms) => setTimeout(callback, ms), clear: id => clearTimeout(id as any) };
  }
  get rewardAdState(): Readonly<RewardAdState> { return Object.freeze({ ...this.value }); }

  async openRewardAdDialog(entryPoint: AdEntryPoint, pendingAction: AdPendingAction): Promise<void> {
    if (this.disposed || this.value.open) return;
    const token = ++this.generation;
    this.value = { ...initial(), open: true, loading: true, entryPoint, pendingAction };
    this.request = new AbortController();
    const signal = this.request.signal;
    this.renderRewardAdDialog();
    try {
      const result = await this.options.client.requestRewardAdUrl(entryPoint, { signal });
      if (!this.current(token)) return;
      this.request = null;
      const now = this.now();
      Object.assign(this.value, result, { loading: false, pollStartedAt: now, countdownEndsAt: now + this.policy.durationMs });
      this.renderRewardAdDialog(); // The UI renders the QR before polling begins.
      if (!this.current(token)) return;
      this.timer = this.timers.set(() => { void this.startRewardAdPolling(token); }, this.policy.initialDelayMs);
      this.updateRewardAdCountdown(token);
    } catch (error) {
      if (this.current(token)) this.fail('广告暂不可用，请稍后重试');
    }
  }

  private async startRewardAdPolling(token: number): Promise<void> {
    this.timer = null;
    if (!this.current(token)) return;
    if (this.now() >= this.value.countdownEndsAt) { this.fail('广告等待超时，请重新观看'); return; }
    this.request = new AbortController();
    try {
      const completed = await this.options.client.queryRewardAdCompleted(this.value.sceneId!, this.request.signal);
      if (!this.current(token)) return;
      this.request = null;
      if (this.now() >= this.value.countdownEndsAt) { this.fail('广告等待超时，请重新观看'); return; }
      if (completed) { this.handleRewardAdCompleted(); return; }
      this.value.pollErrorCount = 0;
      this.value.errorMessage = null;
    } catch {
      if (!this.current(token)) return;
      this.request = null;
      this.value.pollErrorCount++;
      if (this.value.pollErrorCount >= this.policy.maxConsecutiveErrors) { this.fail('广告状态查询失败，请稍后重试'); return; }
      this.value.errorMessage = '网络不稳定，正在重试…';
    }
    this.renderRewardAdDialog();
    if (!this.current(token)) return;
    const delay = Math.min(this.policy.maxIntervalMs, this.policy.intervalMs * 2 ** this.value.pollErrorCount);
    this.timer = this.timers.set(() => { void this.startRewardAdPolling(token); }, delay);
  }

  private updateRewardAdCountdown(token: number): void {
    this.countdown = null;
    if (!this.current(token)) return;
    if (this.now() >= this.value.countdownEndsAt) { this.fail('广告等待超时，请重新观看'); return; }
    this.renderRewardAdDialog();
    if (this.current(token)) this.countdown = this.timers.set(() => this.updateRewardAdCountdown(token), 1000);
  }

  private handleRewardAdCompleted(): void {
    if (!this.value.open || !this.value.pendingAction) return;
    this.stopRewardAdPolling();
    ++this.generation;
    this.value.adUrl = null;
    this.value.errorMessage = null;
    this.grantOnce();
  }

  private grantOnce(): void {
    const action = this.value.pendingAction;
    this.closeRewardAdDialog(); // Clear action before invoking business code, preventing re-entry.
    if (action && !this.disposed) this.options.grant(action);
  }
  stopRewardAdPolling(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    if (this.countdown !== null) this.timers.clear(this.countdown);
    this.timer = this.countdown = null;
    this.request?.abort(); this.request = null;
  }
  closeRewardAdDialog(): void {
    ++this.generation;
    this.stopRewardAdPolling();
    this.value = initial();
    if (!this.disposed) this.renderRewardAdDialog();
  }
  dispose(): void { this.disposed = true; this.closeRewardAdDialog(); }
  renderRewardAdDialog(): void { this.options.render(this.rewardAdState); }
  private current(token: number): boolean { return !this.disposed && this.value.open && token === this.generation; }
  private fail(message: string): void {
    this.closeRewardAdDialog();
    if (this.disposed) return;
    this.value.errorMessage = message;
    this.renderRewardAdDialog(); // Closed state carries the error for the page's toast/status label.
  }
}
