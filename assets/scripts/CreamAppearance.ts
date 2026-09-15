import type { CreamVariant } from './CreamStyle';

export const CREAM_APPEARANCE_STORAGE_KEY = 'wxstack-cream-appearance-v1';
interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadCreamAppearance(storage: AppearanceStorage | null | undefined): CreamVariant {
  try { return storage?.getItem(CREAM_APPEARANCE_STORAGE_KEY) === 'bright' ? 'bright' : 'standard'; }
  catch { return 'standard'; }
}

export function saveCreamAppearance(storage: AppearanceStorage | null | undefined, variant: CreamVariant): boolean {
  try {
    if (!storage) return false;
    storage.setItem(CREAM_APPEARANCE_STORAGE_KEY, variant);
    return true;
  } catch { return false; }
}
