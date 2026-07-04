import type { ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  view: 'chat' | 'create';
  /** Mobile drawer state — ignored on desktop where the sidebar is static. */
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onSelectCreate: () => void;
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
  onSelectCreate,
}: SidebarProps) {
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

      <div className="sidebar-section-label">Recent</div>
      <div className="chat-history">
        {sessions.length === 0 && <p className="empty-hint">No chats yet</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`chat-history-item ${view === 'chat' && activeId === s.id ? 'active' : ''}`}
          >
            <button className="chat-history-title" onClick={() => onSelectChat(s.id)}>
              {s.title || 'New chat'}
            </button>
            <button
              className="chat-history-delete"
              onClick={() => onDeleteChat(s.id)}
              aria-label="Delete chat"
              title="Delete chat"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="script-accent small">Create Everything.</span>
      </div>
    </aside>
  );
}
