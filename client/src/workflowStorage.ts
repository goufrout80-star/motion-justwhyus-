import type { WorkflowTemplate } from './components/workflow/types';

const STORAGE_KEY = 'nanoni.workflowTemplates.v1';

export function loadWorkflowTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkflowTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage full, disabled, or unavailable (e.g. private browsing) — the
    // canvas still works for the session, it just won't persist.
  }
}
