import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { OmniManualPanel } from './components/OmniManualPanel';
import { NanoniMark } from './components/NanoniMark';
import { DemoBanner } from './components/DemoBanner';
import { loadSessions, saveSessions } from './storage';
import type { ChatSession } from './types';

type View = 'chat' | 'create';

function newSession(): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: '', createdAt: now, updatedAt: now, messages: [] };
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => sessions[0]?.id ?? null);
  const [view, setView] = useState<View>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  function handleNewChat() {
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setActiveChatId(session.id);
    setView('chat');
    setSidebarOpen(false);
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setView('chat');
    setSidebarOpen(false);
  }

  function handleDeleteChat(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveChatId((current) => (current === id ? null : current));
  }

  function handleSelectCreate() {
    setView('create');
    setSidebarOpen(false);
  }

  function updateSession(id: string, updater: (s: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? updater(s) : s)).sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  const activeSession = sessions.find((s) => s.id === activeChatId) ?? null;

  return (
    <div className="app-root">
      <DemoBanner />

      {/* Mobile-only top bar with the drawer toggle */}
      <header className="mobile-topbar">
        <button
          className="hamburger-btn"
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="mobile-brand">
          <NanoniMark size={20} />
          <span>
            NANONI <em>Studio</em>
          </span>
        </div>
        <button className="mobile-new-chat" aria-label="New chat" onClick={handleNewChat}>
          +
        </button>
      </header>

      <div className="app-shell">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        <Sidebar
          sessions={sessions}
          activeId={activeChatId}
          view={view}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onSelectCreate={handleSelectCreate}
        />

        <main className="app-main">
          {view === 'create' ? (
            <OmniManualPanel />
          ) : activeSession ? (
            <ChatView
              session={activeSession}
              onUpdateSession={(updater) => updateSession(activeSession.id, updater)}
            />
          ) : (
            <div className="chat-empty chat-empty-standalone">
              <NanoniMark size={40} />
              <p className="script-accent">Create Everything.</p>
              <h2>Start a new chat</h2>
              <p>Talk with Nanoni, or switch to Create Video for manual mode.</p>
              <button className="generate-btn" onClick={handleNewChat}>
                New chat
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
