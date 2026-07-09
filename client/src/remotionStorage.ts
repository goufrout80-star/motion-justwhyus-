import type { RemotionProject } from './types';

const STORAGE_KEY = 'nanoni.remotionProjects.v1';

export function loadRemotionProjects(): RemotionProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backfill `model` for projects saved before the model switcher existed.
    return parsed.map((p) => ({ model: 'gemini-3.5-flash', ...p }));
  } catch {
    return [];
  }
}

export function saveRemotionProjects(projects: RemotionProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Storage full, disabled, or unavailable — the project still works for
    // this session, it just won't persist across reloads.
  }
}
