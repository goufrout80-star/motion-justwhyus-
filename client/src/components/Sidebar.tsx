import { useEffect, useRef, useState } from 'react';
import type { ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';
import { PencilIcon } from './icons';
import { ShortcutsHelp } from './ShortcutsHelp';

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  view: 'chat' | 'create' | 'workflow' | 'remotion';
  /** Mobile drawer state — ignored on desktop where the sidebar is static. */
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onSelectCreate: () => void;
  onSelectWorkflow: () => void;
  onSelectRemotion: () => void;
}

const DELETE_CONFIRM_TIMEOUT_MS = 3000;

function groupLabel(updatedAt: number, now: number): string {
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now - updatedAt) / day);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Previous 7 days';
  return 'Older';
}

export function Sidebar({
  sessions,
  activeId,
  view,
  open,
  onClose,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onSelectCreate,
  onSelectWorkflow,
  onSelectRemotion,
}: SidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  function startRename(s: ChatSession) {
    setRenamingId(s.id);
    setRenameValue(s.title || '');
  }

  function commitRename() {
    if (renamingId) onRenameChat(renamingId, renameValue.trim() || 'New chat');
    setRenamingId(null);
  }

  function handleDeleteClick(id: string) {
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      onDeleteChat(id);
      return;
    }
    setConfirmDeleteId(id);
    setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), DELETE_CONFIRM_TIMEOUT_MS);
  }

  const filtered = query.trim()
    ? sessions.filter((s) => (s.title || 'New chat').toLowerCase().includes(query.trim().toLowerCase()))
    : sessions;

  const now = Date.now();
  const groups = new Map<string, ChatSession[]>();
  for (const s of filtered) {
    const label = groupLabel(s.updatedAt, now);
    const list = groups.get(label) ?? [];
    list.push(s);
    groups.set(label, list);
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <NanoniMark size={22} />
        <span className="sidebar-wordmark">
          NANONI <em>Studio</em>
        </span>
        <button className="sidebar-close" aria-label="Close menu" onClick={onClose}>
          ×
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="plus">+</span> New chat
      </button>

      <button className={`nav-item ${view === 'create' ? 'active' : ''}`} onClick={onSelectCreate}>
        <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="5" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16.5 10.5 21.5 7.5v9l-5-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        Create Video
        <span className="nav-badge">Omni</span>
      </button>

      <button className={`nav-item ${view === 'workflow' ? 'active' : ''}`} onClick={onSelectWorkflow}>
        <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="19" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7 7.2 10.5 16M17 7.2 13.5 16" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Workflow
        <span className="nav-badge">Beta</span>
      </button>

      <button className={`nav-item ${view === 'remotion' ? 'active' : ''}`} onClick={onSelectRemotion}>
        <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 9.5 14 12l-5 2.5v-5z" fill="currentColor" />
        </svg>
        Remotion Studio
        <span className="nav-badge">New</span>
      </button>

      {sessions.length > 0 && (
        <div className="sidebar-search">
          <input
            type="search"
            placeholder="Search chats…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      <div className="chat-history">
        {sessions.length === 0 && (
          <>
            <div className="sidebar-section-label">Recent</div>
            <p className="empty-hint">No chats yet</p>
          </>
        )}
        {sessions.length > 0 && filtered.length === 0 && <p className="empty-hint">No chats match "{query}"</p>}
        {[...groups.entries()].map(([label, group]) => (
          <div key={label}>
            <div className="sidebar-section-label">{label}</div>
            {group.map((s) => (
              <div
                key={s.id}
                className={`chat-history-item ${view === 'chat' && activeId === s.id ? 'active' : ''}`}
              >
                {renamingId === s.id ? (
                  <input
                    ref={renameInputRef}
                    className="chat-history-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === 'Escape') {
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="chat-history-title"
                    onClick={() => onSelectChat(s.id)}
                    onDoubleClick={() => startRename(s)}
                  >
                    {s.title || 'New chat'}
                  </button>
                )}
                {renamingId !== s.id && (
                  <button
                    className="chat-history-rename"
                    onClick={() => startRename(s)}
                    aria-label={`Rename ${s.title || 'chat'}`}
                    title="Rename chat"
                  >
                    <PencilIcon size={12} />
                  </button>
                )}
                <button
                  className={`chat-history-delete ${confirmDeleteId === s.id ? 'confirming' : ''}`}
                  onClick={() => handleDeleteClick(s.id)}
                  aria-label={confirmDeleteId === s.id ? `Confirm delete of ${s.title || 'chat'}` : 'Delete chat'}
                  title={confirmDeleteId === s.id ? 'Click again to delete' : 'Delete chat'}
                >
                  {confirmDeleteId === s.id ? 'Delete?' : '×'}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="script-accent small">Create Everything.</span>
        <ShortcutsHelp />
      </div>
    </aside>
  );
}
