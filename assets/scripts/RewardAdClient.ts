import { AD_REWARD_CONFIG, AD_ENTRY_POINTS, AdEntryPoint } from './RewardAdConfig';

type AdConfig = typeof AD_REWARD_CONFIG;
interface AdStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const REWARD_AD_USER_KEY = 'wxstack-reward-ad-user-id';
let sessionGuestId = '';

export function getOrCreateRewardAdUserId(storage?: AdStorage | null): string {
  try {
    const cached = storage?.getItem(REWARD_AD_USER_KEY);
    if (cached && cached.trim() && cached.length <= 256) return cached;
  } catch { /* A blocked store must retain one guest ID for the current session. */ }
  if (!sessionGuestId) sessionGuestId = `guest_${Date.now()}_${(`000000${Math.floor(Math.random() * 1000000)}`).slice(-6)}`;
  try { storage?.setItem(REWARD_AD_USER_KEY, sessionGuestId); } catch { /* In-memory fallback. */ }
  return sessionGuestId;
}

export function getRewardAdSceneId(entry: AdEntryPoint, config = AD_REWARD_CONFIG): string {
  const id = config.testSceneId || (entry === AD_ENTRY_POINTS.REVIVE ? config.sceneIds.revive
    : entry === AD_ENTRY_POINTS.SETTLEMENT_DOUBLE ? config.sceneIds.doubleReward : config.sceneIds.extraReward);
  if (!id?.trim()) throw new Error('广告位尚未配置，请提供 sceneId');
  return id.trim();
}

/** HTTP transport only: completion cannot directly mutate game rewards. */
export class RewardAdClient {
  readonly userId: string;
  constructor(storage?: AdStorage | null, private config: AdConfig = AD_REWARD_CONFIG,
    private fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.userId = config.testUserId || getOrCreateRewardAdUserId(storage);
  }

  async requestRewardAdUrl(entryPoint: AdEntryPoint,
    options: { adType?: 1 | 2; extra?: Record<string, unknown>; signal?: AbortSignal } = {}): Promise<{ sceneId: string; adUrl: string }> {
    const sceneId = getRewardAdSceneId(entryPoint, this.config);
    const body: Record<string, unknown> = { userId: this.userId, gameId: this.config.gameId, sceneId,
      adType: options.adType ?? (entryPoint === AD_ENTRY_POINTS.REVIVE ? 2 : 1) };
    if (this.config.sn) body.sn = this.config.sn;
    if (options.extra !== undefined) body.extra = JSON.stringify(options.extra);
    const data = await this.request('/appstore/game-center/ad/url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: options.signal,
    });
    if (typeof data?.adUrl !== 'string') throw new Error('广告服务未返回有效链接');
    let url: URL;
    try { url = new URL(data.adUrl); } catch { throw new Error('广告链接格式无效'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('广告链接必须使用 HTTPS');
    return { sceneId, adUrl: data.adUrl };
  }

  async queryRewardAdCompleted(sceneId: string, signal?: AbortSignal): Promise<boolean> {
    const params = new URLSearchParams({ userId: this.userId, gameId: this.config.gameId, sceneId, _ts: `${Date.now()}` });
    const data = await this.request(`/appstore/game-center/ad/status?${params}`, { method: 'GET', signal });
    return String(data?.completed) === '1';
  }

  private async request(path: string, options: RequestInit): Promise<any> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const signal = options.signal;
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 10000);
    try {
      const response = await this.fetcher(this.config.baseUrl.replace(/\/+$/, '') + path,
        { ...options, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`广告服务请求失败（${response.status}）`);
      const result = await response.json();
      if (result?.code !== 100) throw new Error('广告服务暂不可用，请稍后重试');
      return result.data;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
