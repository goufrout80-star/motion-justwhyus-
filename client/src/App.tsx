import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { OmniManualPanel } from './components/OmniManualPanel';
import { NanoniMark } from './components/NanoniMark';
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

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  function handleNewChat() {
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setActiveChatId(session.id);
    setView('chat');
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setView('chat');
  }

  function handleDeleteChat(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveChatId((current) => (current === id ? null : current));
  }

  function updateSession(id: string, updater: (s: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev
        .map((s) => (s.id === id ? updater(s) : s))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  const activeSession = sessions.find((s) => s.id === activeChatId) ?? null;

  return (
    <div className="app-shell">
      <Sidebar
        sessions={sessions}
        activeId={activeChatId}
        view={view}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onSelectCreate={() => setView('create')}
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
            <NanoniMark size={44} />
            <h2>Start a new chat</h2>
            <p>Click “New chat” to talk with Nanoni, or switch to Create Video for manual mode.</p>
            <button className="generate-btn" onClick={handleNewChat}>
              New chat
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
