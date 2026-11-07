import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExampleMaterial, HealthResponse, ReplayScript, SeminarSession } from '../src/shared/types';
import { ApiError, api } from './api';
import { Landing } from './components/Landing';
import { ReplayRoom } from './components/ReplayRoom';
import { Room } from './components/Room';
import { Setup } from './components/Setup';
import { Spinner } from './components/Common';

type View = 'landing' | 'setup' | 'room' | 'replay';
type ReplayMeta = Pick<ReplayScript, 'id' | 'title' | 'description' | 'notice'>;

const LAST_SESSION_KEY = 'seminar-room:last-session';

function replaceQuery(params: Record<string, string> | null): void {
  const url = new URL(window.location.href);
  url.search = '';
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [booting, setBooting] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [examples, setExamples] = useState<ExampleMaterial[]>([]);
  const [replays, setReplays] = useState<ReplayMeta[]>([]);
  const [session, setSession] = useState<SeminarSession | null>(null);
  const [lastSession, setLastSession] = useState<SeminarSession | null>(null);
  const [replay, setReplay] = useState<ReplayScript | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const inspectedUrl = useRef(false);

  const updateSession = useCallback((next: SeminarSession) => {
    setSession(next);
    setLastSession(next);
    window.localStorage.setItem(LAST_SESSION_KEY, next.id);
    if (next.mode === 'live') replaceQuery({ session: next.id });
  }, []);

  const loadSession = useCallback(
    async (id: string, navigate: boolean) => {
      const response = await api.session(id);
      const loaded = response.session;
      setLastSession(loaded);
      window.localStorage.setItem(LAST_SESSION_KEY, loaded.id);
      if (navigate) {
        setSession(loaded);
        setView(loaded.stage === 'draft' ? 'setup' : 'room');
        replaceQuery({ session: loaded.id });
      }
    },
    [],
  );

  useEffect(() => {
    if (inspectedUrl.current) return;
    inspectedUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const replayId = params.get('replay');

    void (async () => {
      const healthPromise = api
        .health()
        .then((value) => {
          setHealth(value);
          setHealthError(null);
        })
        .catch((error: unknown) => {
          setHealthError(error instanceof Error ? error.message : '无法读取服务状态。');
        });
      const examplesPromise = api
        .examples()
        .then((value) => {
          setExamples(value.materials);
          setReplays(value.replays);
        })
        .catch(() => undefined);

      try {
        if (replayId) {
          const response = await api.replay(replayId);
          setReplay(response.replay);
          setView('replay');
        } else if (sessionId) {
          await loadSession(sessionId, true);
        } else {
          const stored = window.localStorage.getItem(LAST_SESSION_KEY);
          if (stored) {
            try {
              await loadSession(stored, false);
            } catch {
              window.localStorage.removeItem(LAST_SESSION_KEY);
            }
          }
        }
      } catch {
        replaceQuery(null);
        setView('landing');
      }
      await Promise.allSettled([healthPromise, examplesPromise]);
      setBooting(false);
    })();
  }, [loadSession]);

  useEffect(() => {
    const title =
      view === 'room' && session
        ? `${session.config.topic} · SeminarRoom`
        : view === 'replay' && replay
          ? `${replay.title} · SeminarRoom`
          : 'SeminarRoom · 材料研讨室';
    document.title = title;
    window.scrollTo({ top: 0 });
  }, [view, session?.config.topic, replay?.title]);

  useEffect(() => {
    if (
      view !== 'setup' ||
      !session ||
      session.stage !== 'draft' ||
      session.questions.length === 3 ||
      session.lastError
    ) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.session(session.id);
        if (!cancelled) updateSession(response.session);
      } catch {
        // The setup page keeps its own visible error paths; polling is best-effort.
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    view,
    session?.id,
    session?.stage,
    session?.questions.length,
    session?.lastError?.message,
    updateSession,
  ]);

  const createSession = async (input: {
    material: string;
    topic: string;
    style: string;
    roles?: Record<string, { name: string }>;
  }) => {
    const created = await api.createSession(input);
    updateSession(created.session);
    setView('setup');
    replaceQuery({ session: created.session.id });
    setPlanning(true);
    setPlanError(null);
    try {
      const planned = await api.plan(created.session.id);
      updateSession(planned.session);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '生成问题失败。');
    } finally {
      setPlanning(false);
    }
  };

  const retryPlan = async () => {
    if (!session) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const planned = await api.plan(session.id);
      updateSession(planned.session);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '生成问题失败。');
    } finally {
      setPlanning(false);
    }
  };

  const start = async (questions: string[]) => {
    if (!session) throw new Error('会话尚未加载。');
    const updated = await api.updateQuestions(session.id, questions);
    const started = await api.start(session.id);
    updateSession({ ...updated.session, ...started.session });
    setView('room');
    replaceQuery({ session: session.id });
  };

  const openReplay = async (id: string) => {
    const response = await api.replay(id);
    setReplay(response.replay);
    setView('replay');
    replaceQuery({ replay: id });
  };

  const exitToLanding = () => {
    if (session && (session.stage === 'running' || session.stage === 'paused')) {
      const confirmed = window.confirm(
        '离开页面不会自动结束研讨。若服务仍在运行，主持人可能继续发起调用。建议先暂停，再离开。仍要离开吗？',
      );
      if (!confirmed) return;
    }
    if (session) setLastSession(session);
    setSession(null);
    setReplay(null);
    setView('landing');
    replaceQuery(null);
  };

  const resumeLast = () => {
    if (!lastSession) return;
    setSession(lastSession);
    setView(lastSession.stage === 'draft' ? 'setup' : 'room');
    replaceQuery({ session: lastSession.id });
    if (lastSession.stage === 'draft' && lastSession.questions.length !== 3 && !planning) {
      setPlanError(lastSession.lastError?.message ?? null);
    }
  };

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">S</div>
        <h1>SeminarRoom</h1>
        <p>正在读取本地服务与会话…</p>
        <Spinner size={20} />
      </div>
    );
  }

  if (view === 'setup' && session) {
    return (
      <Setup
        session={session}
        health={health}
        planning={planning || session.activity.phase === 'planning'}
        planError={planError ?? (session.questions.length !== 3 ? session.lastError?.message ?? null : null)}
        onBack={exitToLanding}
        onRetryPlan={retryPlan}
        onStart={start}
      />
    );
  }

  if (view === 'room' && session) {
    return <Room session={session} setSession={updateSession} onExit={exitToLanding} />;
  }

  if (view === 'replay' && replay) {
    return <ReplayRoom replay={replay} onExit={exitToLanding} />;
  }

  return (
    <Landing
      health={health}
      examples={examples}
      replays={replays}
      lastSession={lastSession}
      onResume={resumeLast}
      onCreate={createSession}
      onReplay={openReplay}
      healthError={healthError}
    />
  );
}
