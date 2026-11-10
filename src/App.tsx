import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ArticleView } from './components/ArticleView';
import { scrollToFragment } from './components/scrollToFragment';
import { GameHeader } from './components/GameHeader';
import { StartScreen } from './components/StartScreen';
import { Toast } from './components/Toast';
import { VictoryPanel } from './components/VictoryPanel';
import { GameEngine } from './game/engine';
import { gameEntry, HOME_ENTRY, readHistoryEntry } from './game/historyState';
import { challengeSearch, parseChallengeParams } from './game/shareUrl';
import { createStatsStore } from './game/stats';
import { createSafeStorage } from './game/storage';
import type { Challenge, GameState, NoticeCode } from './game/types';
import { getStrings, type Strings } from './i18n';
import { wikiClient } from './wiki/client';
import { isSupportedLang, langDir, type Lang } from './wiki/types';

const LANG_KEY = 'wikirace:lang';

type Screen = 'home' | 'game';

export default function App() {
  const storage = useMemo(() => createSafeStorage(), []);
  const statsStore = useMemo(() => createStatsStore(storage), [storage]);
  const [stats, setStats] = useState(() => statsStore.load());
  const [search, setSearch] = useState(() => window.location.search);
  const invite = useMemo(() => parseChallengeParams(search), [search]);
  const [homeLang, setHomeLang] = useState<Lang>(() => {
    const initialInvite = parseChallengeParams(window.location.search);
    if (initialInvite.kind === 'ok') return initialInvite.challenge.lang;
    const saved = storage.getItem(LANG_KEY);
    return isSupportedLang(saved) ? saved : 'en';
  });
  const [screen, setScreen] = useState<Screen>('home');

  const [engine] = useState(
    () =>
      new GameEngine({
        source: wikiClient,
        gameIdSeed: Date.now(),
        onGameStarted: () => setStats(statsStore.recordStarted()),
        onGameWon: (won) => {
          if (!won.challenge || won.startedAt === null || won.finishedAt === null) return;
          setStats(
            statsStore.recordCompleted({
              lang: won.challenge.lang,
              start: won.start ?? won.challenge.start,
              target: won.target ?? won.challenge.target,
              moves: won.moves,
              durationMs: won.finishedAt - won.startedAt,
              path: won.path.slice(0, won.pathIndex + 1),
              completedAt: won.finishedAt,
            }),
          );
        },
      }),
  );
  const state = useSyncExternalStore(engine.subscribe, engine.getState);

  const uiLang: Lang = screen === 'game' && state.challenge ? state.challenge.lang : homeLang;
  const strings = getStrings(uiLang);

  useEffect(() => {
    document.documentElement.lang = uiLang;
    document.documentElement.dir = langDir(uiLang);
  }, [uiLang]);

  useEffect(() => {
    const current = screen === 'game' ? state.path[state.pathIndex] : null;
    document.title = current ? `${current} · WikiRace` : 'WikiRace';
  }, [screen, state.path, state.pathIndex]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    // Entries from before a reload belong to a game that no longer exists.
    window.history.replaceState(HOME_ENTRY, '');
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      setSearch(window.location.search);
      const entry = readHistoryEntry(event.state);
      const current = engine.getState();
      if (entry?.wikirace === 'game' && entry.gameId === current.gameId && current.status !== 'idle') {
        setScreen('game');
        if (current.status === 'playing') {
          void engine.goToIndex(entry.index).then((ok) => {
            if (!ok) window.history.replaceState(gameEntry(current.gameId, engine.getState().pathIndex), '');
          });
        }
        return;
      }
      setScreen('home');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [engine]);

  const startGame = useCallback(
    (challenge: Challenge) => {
      void engine.start(challenge);
      const query = challengeSearch(challenge);
      window.history.pushState(gameEntry(engine.getState().gameId, 0), '', query);
      setSearch(query);
      setHomeLang(challenge.lang);
      storage.setItem(LANG_KEY, challenge.lang);
      setScreen('game');
      window.scrollTo(0, 0);
    },
    [engine, storage],
  );

  const goHome = useCallback(() => {
    window.history.pushState(HOME_ENTRY, '', import.meta.env.BASE_URL);
    setSearch('');
    setScreen('home');
    window.scrollTo(0, 0);
  }, []);

  const restart = useCallback(() => {
    const { challenge } = engine.getState();
    if (challenge) startGame(challenge);
  }, [engine, startGame]);

  /** Moves along the existing path via browser history so Back/Forward stay in sync. */
  const navigateToIndex = useCallback(
    (index: number) => {
      const current = engine.getState();
      if (current.status !== 'playing' || index === current.pathIndex) return;
      const entry = readHistoryEntry(window.history.state);
      if (entry?.wikirace === 'game' && entry.gameId === current.gameId && entry.index === current.pathIndex) {
        window.history.go(index - current.pathIndex);
        return;
      }
      void engine.goToIndex(index).then(() => {
        window.history.replaceState(gameEntry(current.gameId, engine.getState().pathIndex), '');
      });
    },
    [engine],
  );

  const { setPendingFragment } = useScrollManagement(state);

  const followLink = useCallback(
    async (title: string, fragment: string | null) => {
      if (engine.getState().pending) return;
      setPendingFragment(fragment);
      const result = await engine.followLink(title);
      if (result.status !== 'moved') {
        setPendingFragment(null);
        return;
      }
      window.history.pushState(gameEntry(engine.getState().gameId, result.index), '');
    },
    [engine, setPendingFragment],
  );

  const reportBlocked = useCallback((code: NoticeCode, title: string | null) => engine.reportBlockedLink(code, title), [engine]);
  const dismissNotice = useCallback(() => engine.dismissNotice(), [engine]);

  if (screen === 'home') {
    return (
      <div className="app" lang={uiLang} dir={langDir(uiLang)}>
        <StartScreen
          key={homeLang}
          lang={homeLang}
          strings={strings}
          invite={invite}
          stats={stats}
          statsPersistent={statsStore.persistent}
          client={wikiClient}
          onLangChange={(lang) => {
            setHomeLang(lang);
            storage.setItem(LANG_KEY, lang);
          }}
          onStart={startGame}
          onResetStats={() => setStats(statsStore.clear())}
        />
      </div>
    );
  }

  return (
    <div className="app" lang={uiLang} dir={langDir(uiLang)}>
      <GameHeader
        state={state}
        strings={strings}
        onBack={() => navigateToIndex(engine.getState().pathIndex - 1)}
        onSelectStep={navigateToIndex}
        onRestart={restart}
        onNewChallenge={goHome}
      />
      <main className="reader" id="main">
        {state.status === 'won' && (
          <VictoryPanel key={state.gameId} state={state} strings={strings} onRestart={restart} onNewChallenge={goHome} />
        )}
        {state.status === 'starting' && <LoadingArticle strings={strings} />}
        {state.status === 'failed' && (
          <StartErrorPanel state={state} strings={strings} onRetry={restart} onHome={goHome} />
        )}
        {state.article && (state.status === 'playing' || state.status === 'won') && (
          <ArticleView
            article={state.article}
            busy={state.pending !== null}
            strings={strings}
            onFollow={followLink}
            onBlocked={reportBlocked}
          />
        )}
      </main>
      <Toast notice={state.notice} strings={strings} onDismiss={dismissNotice} />
    </div>
  );
}

/**
 * New articles open at the top (or at the linked section); Back/Forward
 * restores the scroll position the player left the article at.
 */
function useScrollManagement(state: GameState) {
  const pendingFragment = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  const currentKey = `${state.gameId}:${state.pathIndex}:${state.path[state.pathIndex] ?? ''}`;
  const keyRef = useRef(currentKey);
  const movesRef = useRef(state.moves);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.current.set(keyRef.current, window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (keyRef.current === currentKey && movesRef.current === state.moves) return;
    const isNewMove = state.moves !== movesRef.current;
    keyRef.current = currentKey;
    movesRef.current = state.moves;

    if (state.status === 'won') {
      window.scrollTo(0, 0);
      return;
    }
    const fragment = pendingFragment.current;
    pendingFragment.current = null;
    if (isNewMove) {
      positions.current.delete(currentKey);
      if (!fragment || !scrollToFragment(document.querySelector('.wr-article-body'), fragment)) window.scrollTo(0, 0);
      return;
    }
    window.scrollTo(0, positions.current.get(currentKey) ?? 0);
  }, [currentKey, state.moves, state.status]);

  const setPendingFragment = useCallback((fragment: string | null) => {
    pendingFragment.current = fragment;
  }, []);

  return { setPendingFragment };
}

function LoadingArticle({ strings }: { strings: Strings }) {
  return (
    <div className="loading-article" role="status">
      <p className="muted">{strings.preparingRace}</p>
      <div className="skeleton skeleton-title" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton skeleton-short" />
    </div>
  );
}

function StartErrorPanel({
  state,
  strings,
  onRetry,
  onHome,
}: {
  state: GameState;
  strings: Strings;
  onRetry: () => void;
  onHome: () => void;
}) {
  const error = state.startError;
  if (!error) return null;
  const retryable = error.code === 'network' || error.code === 'api';
  return (
    <section className="card error-panel" role="alert">
      <h2 className="card-title">{strings.startErrorTitle}</h2>
      <p>{strings.startErrors[error.code](error.title)}</p>
      <div className="card-actions">
        {retryable && (
          <button type="button" className="button button-primary" onClick={onRetry}>
            {strings.tryAgain}
          </button>
        )}
        <button type="button" className={retryable ? 'button' : 'button button-primary'} onClick={onHome}>
          {strings.backToMenu}
        </button>
      </div>
    </section>
  );
}
