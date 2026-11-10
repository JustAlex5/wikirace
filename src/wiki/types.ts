export const SUPPORTED_LANGUAGES = ['en', 'he'] as const;

export type Lang = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function langDir(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'he' ? 'rtl' : 'ltr';
}

/** A fully fetched, sanitized article ready for rendering. */
export interface Article {
  lang: Lang;
  /** Canonical title after redirect resolution (spaces, not underscores). */
  title: string;
  pageId: number;
  revId: number | null;
  /** Sanitized HTML of the display title (may contain italics etc.). */
  displayTitleHtml: string;
  /** Sanitized article body HTML with links annotated for the game. */
  html: string;
  /** Filtered TemplateStyles CSS shipped with the article. */
  css: string;
  isDisambiguation: boolean;
  description: string | null;
  /** Title that was requested, if it redirected to `title`. */
  redirectedFrom: string | null;
}

/** Lightweight info about a page, used to validate challenge endpoints. */
export interface PageInfo {
  title: string;
  pageId: number;
  isDisambiguation: boolean;
  description: string | null;
}

export interface SearchSuggestion {
  title: string;
  description: string | null;
  isDisambiguation: boolean;
}

export type WikiErrorKind = 'missing' | 'invalid' | 'not-article' | 'network' | 'api' | 'aborted';

export class WikiError extends Error {
  readonly kind: WikiErrorKind;
  readonly title: string | null;

  constructor(kind: WikiErrorKind, message: string, title: string | null = null) {
    super(message);
    this.name = 'WikiError';
    this.kind = kind;
    this.title = title;
  }
}

export function isWikiError(error: unknown): error is WikiError {
  return error instanceof WikiError;
}
