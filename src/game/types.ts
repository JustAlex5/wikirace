import type { Article, Lang, WikiErrorKind } from '../wiki/types';

export interface Challenge {
  lang: Lang;
  start: string;
  target: string;
}

export type GameStatus = 'idle' | 'starting' | 'playing' | 'won' | 'failed';

export interface MoveRecord {
  from: string;
  /** Canonical title that was reached. */
  to: string;
  /** Title of the link that was clicked (differs from `to` for redirects). */
  via: string;
  at: number;
}

export interface PendingNavigation {
  title: string;
  /** "link" counts as a move on success; "history" restores an earlier path position. */
  kind: 'link' | 'history';
}

export type StartErrorCode = WikiErrorKind | 'same-article' | 'target-disambiguation';

export interface StartError {
  code: StartErrorCode;
  which: 'start' | 'target' | null;
  title: string | null;
}

export type NoticeCode =
  | 'not-article'
  | 'redlink'
  | 'external'
  | 'unsupported'
  | 'missing'
  | 'invalid'
  | 'network'
  | 'api'
  | 'history-failed';

export interface GameNotice {
  id: number;
  code: NoticeCode;
  title: string | null;
}

export interface GameState {
  /** Increments for every started game; used to tie browser history entries to a game. */
  gameId: number;
  status: GameStatus;
  /** The challenge as requested (e.g. from the URL). */
  challenge: Challenge | null;
  /** Canonical start/target titles after redirect resolution. */
  start: string | null;
  target: string | null;
  /** Articles on the current route; browser Back/Forward move within it. */
  path: string[];
  /** Position of the displayed article inside `path`. */
  pathIndex: number;
  /** Total links followed. Never decreases when going back. */
  moves: number;
  moveLog: MoveRecord[];
  article: Article | null;
  pending: PendingNavigation | null;
  startedAt: number | null;
  finishedAt: number | null;
  startError: StartError | null;
  notice: GameNotice | null;
}

export type FollowResult =
  | { status: 'moved'; index: number; won: boolean }
  | { status: 'ignored'; reason: 'busy' | 'not-playing' | 'same-article' }
  | { status: 'rejected'; reason: NoticeCode }
  | { status: 'cancelled' };
