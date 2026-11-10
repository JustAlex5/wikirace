import type { ArticleSource } from '../wiki/client';
import { fallbackNamespaceTable, isArticleTitle, type NamespaceTable } from '../wiki/namespaces';
import { isValidTitle, normalizeTitle, titlesEqual } from '../wiki/titles';
import { isWikiError, type Article, type Lang } from '../wiki/types';
import type {
  Challenge,
  FollowResult,
  GameNotice,
  GameState,
  NoticeCode,
  StartError,
} from './types';

export interface GameEngineOptions {
  source: ArticleSource;
  now?: () => number;
  onGameStarted?: (state: GameState) => void;
  onGameWon?: (state: GameState) => void;
  /** Maximum number of articles kept in memory for Back navigation. */
  cacheSize?: number;
  /**
   * Seed for game ids. Use a per-page-load unique value (e.g. Date.now()) so
   * history entries left over from before a reload never match a new game.
   */
  gameIdSeed?: number;
}

type Listener = () => void;

export function createInitialState(): GameState {
  return {
    gameId: 0,
    status: 'idle',
    challenge: null,
    start: null,
    target: null,
    path: [],
    pathIndex: 0,
    moves: 0,
    moveLog: [],
    article: null,
    pending: null,
    startedAt: null,
    finishedAt: null,
    startError: null,
    notice: null,
  };
}

/**
 * Framework-agnostic game state machine. All gameplay rules live here:
 * move counting, the Back/Forward path stack, duplicate-click protection,
 * redirect handling and victory detection. React subscribes through
 * `subscribe`/`getState` (compatible with `useSyncExternalStore`).
 */
export class GameEngine {
  private state: GameState = createInitialState();
  private readonly listeners = new Set<Listener>();
  private readonly source: ArticleSource;
  private readonly now: () => number;
  private readonly options: GameEngineOptions;
  private readonly cache = new Map<string, Article>();
  private readonly cacheSize: number;
  private namespaces: NamespaceTable = fallbackNamespaceTable('en');
  /** Incremented whenever an in-flight request becomes obsolete. */
  private token = 0;
  private controller: AbortController | null = null;
  private noticeId = 0;

  constructor(options: GameEngineOptions) {
    this.options = options;
    this.source = options.source;
    this.now = options.now ?? (() => Date.now());
    this.cacheSize = options.cacheSize ?? 40;
    this.state = { ...createInitialState(), gameId: options.gameIdSeed ?? 0 };
  }

  getState = (): GameState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private notice(code: NoticeCode, title: string | null = null): GameNotice {
    this.noticeId += 1;
    return { id: this.noticeId, code, title };
  }

  private cancelInFlight(): number {
    this.controller?.abort();
    this.controller = null;
    this.token += 1;
    return this.token;
  }

  private cacheKey(lang: Lang, title: string): string {
    return `${lang}:${normalizeTitle(title)}`;
  }

  private remember(article: Article, requestedTitle?: string): void {
    const keys = [this.cacheKey(article.lang, article.title)];
    if (requestedTitle) keys.push(this.cacheKey(article.lang, requestedTitle));
    if (article.redirectedFrom) keys.push(this.cacheKey(article.lang, article.redirectedFrom));
    for (const key of keys) {
      this.cache.delete(key);
      this.cache.set(key, article);
    }
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private recall(lang: Lang, title: string): Article | undefined {
    return this.cache.get(this.cacheKey(lang, title));
  }

  /** Starts (or restarts) a challenge. The start article counts as zero moves. */
  async start(challenge: Challenge): Promise<void> {
    const token = this.cancelInFlight();
    const controller = new AbortController();
    this.controller = controller;
    const gameId = this.state.gameId + 1;
    this.setState({ ...createInitialState(), gameId, status: 'starting', challenge });

    const fail = (error: StartError) => {
      if (token === this.token) this.setState({ status: 'failed', startError: error });
    };

    if (!isValidTitle(challenge.start)) return fail({ code: 'invalid', which: 'start', title: challenge.start });
    if (!isValidTitle(challenge.target)) return fail({ code: 'invalid', which: 'target', title: challenge.target });
    if (titlesEqual(challenge.start, challenge.target)) {
      return fail({ code: 'same-article', which: null, title: normalizeTitle(challenge.start) });
    }

    const tag = <T>(which: 'start' | 'target', promise: Promise<T>) =>
      promise.catch((error: unknown) => {
        throw { which, error };
      });

    try {
      const [namespaces, startArticle, targetInfo] = await Promise.all([
        this.source.getNamespaces(challenge.lang),
        tag('start', this.recall(challenge.lang, challenge.start)
          ? Promise.resolve(this.recall(challenge.lang, challenge.start) as Article)
          : this.source.fetchArticle(challenge.lang, challenge.start, controller.signal)),
        tag('target', this.source.resolvePage(challenge.lang, challenge.target, controller.signal)),
      ]);
      if (token !== this.token) return;

      if (titlesEqual(startArticle.title, targetInfo.title)) {
        return fail({ code: 'same-article', which: null, title: startArticle.title });
      }
      if (targetInfo.isDisambiguation) {
        return fail({ code: 'target-disambiguation', which: 'target', title: targetInfo.title });
      }

      this.namespaces = namespaces;
      this.remember(startArticle, challenge.start);
      this.controller = null;
      this.setState({
        status: 'playing',
        start: startArticle.title,
        target: targetInfo.title,
        path: [startArticle.title],
        pathIndex: 0,
        article: startArticle,
        startedAt: this.now(),
      });
      this.options.onGameStarted?.(this.state);
    } catch (caught) {
      const { which, error } = caught as { which?: 'start' | 'target'; error?: unknown };
      const kind = isWikiError(error) ? error.kind : 'network';
      if (kind === 'aborted') return;
      const title = which === 'start' ? challenge.start : which === 'target' ? challenge.target : null;
      fail({ code: kind, which: which ?? null, title });
    }
  }

  restart(): Promise<void> {
    if (!this.state.challenge) return Promise.resolve();
    return this.start(this.state.challenge);
  }

  /** Abandons the current game and returns to the idle state. */
  reset(): void {
    this.cancelInFlight();
    this.setState({ ...createInitialState(), gameId: this.state.gameId });
  }

  dismissNotice(): void {
    if (this.state.notice) this.setState({ notice: null });
  }

  /** Reports a click on a link that can never be followed (external, red link, File: ...). */
  reportBlockedLink(code: NoticeCode, title: string | null = null): void {
    if (this.state.status === 'playing') this.setState({ notice: this.notice(code, title) });
  }

  /**
   * Follows an internal article link. Exactly one move is counted when the
   * destination loads successfully; everything else leaves the count unchanged.
   */
  async followLink(rawTitle: string): Promise<FollowResult> {
    const state = this.state;
    if (state.status !== 'playing') return { status: 'ignored', reason: 'not-playing' };
    if (state.pending) return { status: 'ignored', reason: 'busy' };

    if (!isValidTitle(rawTitle)) {
      this.setState({ notice: this.notice('invalid', rawTitle) });
      return { status: 'rejected', reason: 'invalid' };
    }
    const requested = normalizeTitle(rawTitle);
    if (!isArticleTitle(requested, this.namespaces)) {
      this.setState({ notice: this.notice('not-article', requested) });
      return { status: 'rejected', reason: 'not-article' };
    }
    const current = state.path[state.pathIndex];
    if (titlesEqual(requested, current)) return { status: 'ignored', reason: 'same-article' };

    const lang = state.challenge?.lang ?? 'en';
    const token = this.cancelInFlight();
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ pending: { title: requested, kind: 'link' }, notice: null });

    let article: Article;
    try {
      article = this.recall(lang, requested) ?? (await this.source.fetchArticle(lang, requested, controller.signal));
    } catch (error) {
      if (token !== this.token) return { status: 'cancelled' };
      const kind = isWikiError(error) ? error.kind : 'network';
      if (kind === 'aborted') {
        this.setState({ pending: null });
        return { status: 'cancelled' };
      }
      const code: NoticeCode = kind === 'not-article' || kind === 'missing' || kind === 'invalid' || kind === 'api' ? kind : 'network';
      this.controller = null;
      this.setState({ pending: null, notice: this.notice(code, requested) });
      return { status: 'rejected', reason: code };
    }
    if (token !== this.token) return { status: 'cancelled' };
    this.controller = null;

    const latest = this.state;
    const from = latest.path[latest.pathIndex];
    if (titlesEqual(article.title, from)) {
      this.setState({ pending: null });
      return { status: 'ignored', reason: 'same-article' };
    }

    this.remember(article, requested);
    const path = [...latest.path.slice(0, latest.pathIndex + 1), article.title];
    const won = latest.target !== null && titlesEqual(article.title, latest.target);
    const at = this.now();
    this.setState({
      path,
      pathIndex: path.length - 1,
      moves: latest.moves + 1,
      moveLog: [...latest.moveLog, { from, to: article.title, via: requested, at }],
      article,
      pending: null,
      status: won ? 'won' : 'playing',
      finishedAt: won ? at : null,
    });
    if (won) this.options.onGameWon?.(this.state);
    return { status: 'moved', index: path.length - 1, won };
  }

  /**
   * Moves to an earlier (or later) article already on the current route, as
   * used by Back/Forward. Never changes the move count. Cancels any pending
   * link navigation so a late response cannot be counted.
   */
  async goToIndex(index: number): Promise<boolean> {
    const state = this.state;
    if (state.status !== 'playing') return false;
    if (!Number.isInteger(index) || index < 0 || index >= state.path.length) return false;
    if (index === state.pathIndex && !state.pending) return true;

    const lang = state.challenge?.lang ?? 'en';
    const title = state.path[index];
    const token = this.cancelInFlight();
    const cached = this.recall(lang, title);
    if (cached) {
      this.setState({ pathIndex: index, article: cached, pending: null, notice: null });
      return true;
    }

    const controller = new AbortController();
    this.controller = controller;
    this.setState({ pending: { title, kind: 'history' }, notice: null });
    try {
      const article = await this.source.fetchArticle(lang, title, controller.signal);
      if (token !== this.token) return false;
      this.controller = null;
      this.remember(article, title);
      this.setState({ pathIndex: index, article, pending: null });
      return true;
    } catch {
      if (token !== this.token) return false;
      this.controller = null;
      this.setState({ pending: null, notice: this.notice('history-failed', title) });
      return false;
    }
  }

  back(): Promise<boolean> {
    return this.goToIndex(this.state.pathIndex - 1);
  }
}
