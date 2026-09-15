export const STAMINA_CAP = 5; // Natural recovery limit and initial balance.
export const STAMINA_AD_REWARD = 5;
export const STAMINA_INTERVAL_MS = 30 * 60 * 1000;
export const STAMINA_STORAGE_KEY = 'wxstack-stamina-v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface StaminaState { amount: number; nextAt: number | null }

/** Local stamina; elapsed offline time is reconciled on every read or spend. */
export class Stamina {
  private state: StaminaState;

  constructor(private storage: StorageLike | null | undefined, now = Date.now()) {
    this.state = { amount: STAMINA_CAP, nextAt: null };
    try {
      const saved = JSON.parse(storage?.getItem(STAMINA_STORAGE_KEY) ?? 'null');
      if (saved && Number.isInteger(saved.amount) && saved.amount >= 0
        && (saved.amount >= STAMINA_CAP ? saved.nextAt === null
          : typeof saved.nextAt === 'number' && Number.isFinite(saved.nextAt) && saved.nextAt > 0)) {
        this.state = { amount: saved.amount, nextAt: saved.nextAt };
      }
    } catch { /* Storage failures keep a usable in-session balance. */ }
    this.refresh(now);
    this.save();
  }

  snapshot(now = Date.now()): { amount: number; nextAt: number | null } {
    this.refresh(now);
    return { ...this.state };
  }

  grantAdReward(now = Date.now()): void {
    this.refresh(now);
    this.state = { amount: this.state.amount + STAMINA_AD_REWARD, nextAt: null };
    this.save();
  }

  spend(now = Date.now()): boolean {
    this.refresh(now);
    if (this.state.amount <= 0) return false;
    if (this.state.amount === STAMINA_CAP) this.state.nextAt = now + STAMINA_INTERVAL_MS;
    this.state.amount -= 1;
    this.save();
    return true;
  }

  private refresh(now: number): void {
    if (this.state.nextAt !== null && now >= this.state.nextAt) {
      const gained = Math.floor((now - this.state.nextAt) / STAMINA_INTERVAL_MS) + 1;
      this.state.amount = Math.min(STAMINA_CAP, this.state.amount + gained);
      this.state.nextAt = this.state.amount === STAMINA_CAP ? null
        : this.state.nextAt + gained * STAMINA_INTERVAL_MS;
      this.save();
    }
  }

  private save(): void {
    try { this.storage?.setItem(STAMINA_STORAGE_KEY, JSON.stringify(this.state)); }
    catch { /* Keep the in-memory balance when persistence is unavailable. */ }
  }
}
