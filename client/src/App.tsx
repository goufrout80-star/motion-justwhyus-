import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { OmniManualPanel } from './components/OmniManualPanel';
import { WorkflowView } from './components/WorkflowView';
import { NanoniMark } from './components/NanoniMark';
import { DemoBanner } from './components/DemoBanner';
import { loadSessions, saveSessions } from './storage';
import { loadRemotionProjects, saveRemotionProjects } from './remotionStorage';
import type { ChatSession, RemotionProject } from './types';

// Remotion + @babel/standalone are a heavy dependency (~3MB) only needed by
// this one view — code-split it so everyone else's initial bundle stays small.
const RemotionStudioView = lazy(() =>
  import('./components/RemotionStudioView').then((m) => ({ default: m.RemotionStudioView }))
);

type View = 'chat' | 'create' | 'workflow' | 'remotion';

function newSession(): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: '', createdAt: now, updatedAt: now, messages: [] };
}

function newRemotionProject(): RemotionProject {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    createdAt: now,
    updatedAt: now,
    code: '',
    durationInFrames: 150,
    fps: 30,
    width: 1280,
    height: 720,
    messages: [],
  };
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => sessions[0]?.id ?? null);
  const [remotionProjects, setRemotionProjects] = useState<RemotionProject[]>(() => loadRemotionProjects());
  const [activeRemotionId, setActiveRemotionId] = useState<string | null>(() => remotionProjects[0]?.id ?? null);
  const [view, setView] = useState<View>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    saveRemotionProjects(remotionProjects);
  }, [remotionProjects]);

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

  function handleRenameChat(id: string, title: string) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function handleSelectCreate() {
    setView('create');
    setSidebarOpen(false);
  }

  function handleSelectWorkflow() {
    setView('workflow');
    setSidebarOpen(false);
  }

  function handleNewRemotionProject() {
    const project = newRemotionProject();
    setRemotionProjects((prev) => [project, ...prev]);
    setActiveRemotionId(project.id);
    setView('remotion');
    setSidebarOpen(false);
  }

  function handleSelectRemotion() {
    if (!activeRemotionId && remotionProjects.length > 0) {
      setActiveRemotionId(remotionProjects[0].id);
    }
    setView('remotion');
    setSidebarOpen(false);
  }

  function updateSession(id: string, updater: (s: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? updater(s) : s)).sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  function updateRemotionProject(id: string, updater: (p: RemotionProject) => RemotionProject) {
    setRemotionProjects((prev) =>
      prev.map((p) => (p.id === id ? updater(p) : p)).sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  const activeSession = sessions.find((s) => s.id === activeChatId) ?? null;
  const activeRemotionProject = remotionProjects.find((p) => p.id === activeRemotionId) ?? null;

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
          onRenameChat={handleRenameChat}
          onSelectCreate={handleSelectCreate}
          onSelectWorkflow={handleSelectWorkflow}
          onSelectRemotion={handleSelectRemotion}
        />

        <main className="app-main">
          <div
            key={
              view === 'chat'
                ? `chat-${activeChatId ?? 'none'}`
                : view === 'remotion'
                  ? `remotion-${activeRemotionId ?? 'none'}`
                  : view
            }
            className="view-transition"
          >
            {view === 'create' ? (
              <OmniManualPanel />
            ) : view === 'workflow' ? (
              <WorkflowView />
            ) : view === 'remotion' ? (
              activeRemotionProject ? (
                <Suspense fallback={<div className="remotion-loading">Loading Remotion Studio…</div>}>
                  <RemotionStudioView
                    project={activeRemotionProject}
                    onUpdateProject={(updater) => updateRemotionProject(activeRemotionProject.id, updater)}
                    onNewProject={handleNewRemotionProject}
                  />
                </Suspense>
              ) : (
                <div className="chat-empty chat-empty-standalone">
                  <NanoniMark size={40} />
                  <p className="script-accent">Create Everything.</p>
                  <h2>Start a Remotion project</h2>
                  <p>Describe a video composition and watch it build live — no render yet, preview only.</p>
                  <button className="generate-btn" onClick={handleNewRemotionProject}>
                    New Remotion project
                  </button>
                </div>
              )
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
          </div>
        </main>
      </div>
    </div>
  );
}
