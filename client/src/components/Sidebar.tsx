import type { ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  view: 'chat' | 'create';
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onSelectCreate: () => void;
}

export function Sidebar({
  sessions,
  activeId,
  view,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onSelectCreate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <NanoniMark size={26} />
        <span>Nanoni</span>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="plus">+</span> New chat
      </button>

      <button
        className={`nav-item ${view === 'create' ? 'active' : ''}`}
        onClick={onSelectCreate}
      >
        <span className="nav-icon">🎬</span> Create Video (Manual)
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
    </aside>
  );
}
