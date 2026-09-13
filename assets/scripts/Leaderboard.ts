export const LEADERBOARD_STORAGE_KEY = 'wxstack-leaderboard-v1';
export const LEADERBOARD_PREVIEW_BACKUP_KEY = 'wxstack-leaderboard-before-preview-cleanup-v1';
export const LEADERBOARD_LIMIT = 10;
export const NICKNAME_STORAGE_KEY = 'wxstack-nickname';
export const DEFAULT_NICKNAME = '叠叠玩家';
export const NICKNAME_MAX_LENGTH = 12;

export interface LeaderboardEntry {
  id: string;
  score: number;
  perfectCount: number | null;
  finishedAt: number | null;
  kind: 'round' | 'legacy';
  nickname?: string;
}

export interface RoundResult {
  id: string;
  score: number;
  perfectCount: number;
  finishedAt: number;
  testMode: boolean;
  nickname?: string;
}

export interface LeaderboardSnapshot {
  entries: LeaderboardEntry[];
  persistent: boolean;
}

/** Replace this provider with an HTTP implementation when online ranking is ready. */
export interface LeaderboardRepository {
  list(): Promise<LeaderboardSnapshot>;
  submit(result: RoundResult): Promise<LeaderboardSnapshot>;
}

export interface LeaderboardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function validInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function leaderboardTier(score: number): number {
  const layers = validInteger(score) ? score : 0;
  return layers >= 500 ? 5 : layers >= 350 ? 4 : layers >= 200 ? 3 : layers >= 100 ? 2 : layers >= 50 ? 1 : 0;
}

export function leaderboardTitle(score: number): string {
  const layers = validInteger(score) ? score : 0;
  if (layers >= 500) {
    const stars = Math.floor((layers - 500) / 100);
    return stars > 0 ? `王者 +${stars} 星` : '最强王者';
  }
  return ['青铜', '白银', '黄金', '铂金', '钻石'][leaderboardTier(layers)];
}

/** Keep visible text intact; validation rejects long names instead of truncating.
 * Whitespace controls become spaces, while invisible formatting is removed.
 */
export function normalizeNickname(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC')
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim().normalize('NFC');
}

function validNickname(value: string): boolean {
  const length = Array.from(value).length;
  return length > 0 && length <= NICKNAME_MAX_LENGTH;
}

export function loadNickname(storage: LeaderboardStorage | null): string {
  try {
    const nickname = normalizeNickname(storage?.getItem(NICKNAME_STORAGE_KEY));
    return validNickname(nickname) ? nickname : DEFAULT_NICKNAME;
  } catch {
    return DEFAULT_NICKNAME;
  }
}

export function saveNickname(storage: LeaderboardStorage | null, nickname: string): boolean {
  const normalized = normalizeNickname(nickname);
  if (!storage || !validNickname(normalized)) return false;
  try {
    storage.setItem(NICKNAME_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

function withNormalizedNickname(entry: LeaderboardEntry): LeaderboardEntry {
  const { nickname: value, ...record } = entry;
  const nickname = normalizeNickname(value);
  return validNickname(nickname) ? { ...record, nickname } : record;
}

function validEntry(value: any): value is LeaderboardEntry {
  if (!value || typeof value.id !== 'string' || !value.id.length || value.id.length > 160
      || !validInteger(value.score)) return false;
  if (value.kind === 'legacy') return value.perfectCount === null && value.finishedAt === null;
  return value.kind === 'round' && validInteger(value.perfectCount) && value.perfectCount <= value.score
    && validInteger(value.finishedAt) && value.finishedAt <= 8640000000000000;
}

function ranked(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const ids = new Set<string>();
  return entries.filter(entry => {
    if (!validEntry(entry) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  }).map(withNormalizedNickname).sort((a, b) => b.score - a.score
    || (b.perfectCount ?? -1) - (a.perfectCount ?? -1)
    || (a.finishedAt ?? 0) - (b.finishedAt ?? 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, LEADERBOARD_LIMIT);
}

/** Exact fingerprints of the old UI preview fixture, never a score/name heuristic. */
function isPreviewRecord(entry: any): boolean {
  const scores = [1720, 1000, 700, 600, 500, 350, 200, 100, 50, 0];
  const names = ['云端建筑师小山', '今天也要叠个正着', '对齐大师', '叠叠玩家', '星空旅人'];
  const match = typeof entry?.id === 'string' ? /^design-([0-9])$/.exec(entry.id) : null;
  if (!match) return false;
  const index = Number(match[1]);
  return entry.kind === 'round' && entry.finishedAt === 1700000000000
    && entry.score === scores[index] && entry.perfectCount === Math.min(17, scores[index])
    && entry.nickname === names[index % names.length];
}

/** Local data stays under the current origin; rejected storage falls back to memory. */
export class LocalLeaderboardRepository implements LeaderboardRepository {
  private entries: LeaderboardEntry[] = [];
  private persistent = true;
  private pendingPreviewBackup: string | null = null;

  constructor(private readonly storage: LeaderboardStorage | null, legacyBest = 0) {
    let initialized = false;
    if (!storage) this.persistent = false;
    try {
      const raw = storage?.getItem(LEADERBOARD_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.version === 1 && Array.isArray(saved.entries)) {
          const localEntries = saved.entries.filter((entry: unknown) => !isPreviewRecord(entry));
          const hadPreview = localEntries.length !== saved.entries.length;
          if (hadPreview) this.pendingPreviewBackup = raw;
          this.entries = ranked(localEntries);
          // If preview rows displaced the real rounds, preserve the independently
          // saved personal best as a legacy record without inventing round details.
          initialized = this.entries.length > 0 || !hadPreview;
        }
      }
    } catch {
      // A damaged record must not prevent playing or opening the leaderboard.
    }
    if (!initialized && validInteger(legacyBest) && legacyBest > 0) {
      this.entries = [{ id: 'legacy-best', kind: 'legacy', score: legacyBest, perfectCount: null, finishedAt: null }];
    }
    this.persist();
  }

  async list(): Promise<LeaderboardSnapshot> {
    return this.snapshot();
  }

  async submit(result: RoundResult): Promise<LeaderboardSnapshot> {
    if (result.testMode) return this.snapshot();
    const entry: LeaderboardEntry = {
      id: result.id, kind: 'round', score: result.score,
      perfectCount: result.perfectCount, finishedAt: result.finishedAt,
      nickname: result.nickname,
    };
    if (!validEntry(entry)) throw new Error('Invalid round result');
    if (!this.entries.some(saved => saved.id === entry.id)) {
      this.entries = ranked([...this.entries, entry]);
      this.persist();
    }
    return this.snapshot();
  }

  private snapshot(): LeaderboardSnapshot {
    return { entries: this.entries.map(entry => ({ ...entry })), persistent: this.persistent };
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      if (this.pendingPreviewBackup) {
        if (!this.storage.getItem(LEADERBOARD_PREVIEW_BACKUP_KEY)) {
          this.storage.setItem(LEADERBOARD_PREVIEW_BACKUP_KEY, this.pendingPreviewBackup);
        }
        this.pendingPreviewBackup = null;
      }
      this.storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify({ version: 1, entries: this.entries }));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
  }
}
