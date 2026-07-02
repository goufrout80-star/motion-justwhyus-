import type { ChatSession } from './types';

const STORAGE_KEY = 'nanoni.chatSessions.v1';

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage full, disabled, or unavailable (e.g. private browsing) —
    // chat still works for the session, it just won't persist.
  }
}
