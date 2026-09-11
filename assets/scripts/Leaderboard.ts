export const LEADERBOARD_STORAGE_KEY = 'wxstack-leaderboard-v1';
export const LEADERBOARD_LIMIT = 10;

export interface LeaderboardEntry {
  id: string;
  score: number;
  perfectCount: number | null;
  finishedAt: number | null;
  kind: 'round' | 'legacy';
}

export interface RoundResult {
  id: string;
  score: number;
  perfectCount: number;
  finishedAt: number;
  testMode: boolean;
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
  }).sort((a, b) => b.score - a.score
    || (b.perfectCount ?? -1) - (a.perfectCount ?? -1)
    || (a.finishedAt ?? 0) - (b.finishedAt ?? 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, LEADERBOARD_LIMIT);
}

/** Local data stays under the current origin; rejected storage falls back to memory. */
export class LocalLeaderboardRepository implements LeaderboardRepository {
  private entries: LeaderboardEntry[] = [];
  private persistent = true;

  constructor(private readonly storage: LeaderboardStorage | null, legacyBest = 0) {
    let initialized = false;
    if (!storage) this.persistent = false;
    try {
      const raw = storage?.getItem(LEADERBOARD_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.version === 1 && Array.isArray(saved.entries)) {
          this.entries = ranked(saved.entries);
          initialized = true;
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
      this.storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify({ version: 1, entries: this.entries }));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
  }
}
