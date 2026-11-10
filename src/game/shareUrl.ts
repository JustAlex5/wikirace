import { isValidTitle, normalizeTitle, titlesEqual } from '../wiki/titles';
import { isSupportedLang } from '../wiki/types';
import type { Challenge } from './types';

/**
 * Challenges are shared through query parameters on the app's root URL:
 *   https://USER.github.io/REPO/?lang=en&start=Germany&target=Volkswagen
 * Only the challenge configuration is encoded, never the player's position,
 * so editing the URL can only start a different challenge from move zero.
 */

export type ChallengeParamsResult =
  | { kind: 'none' }
  | { kind: 'ok'; challenge: Challenge }
  | { kind: 'error'; reason: 'invalid-lang' | 'missing-title' | 'invalid-title' | 'same-article' };

export function parseChallengeParams(search: string): ChallengeParamsResult {
  const params = new URLSearchParams(search);
  const rawStart = params.get('start');
  const rawTarget = params.get('target');
  const rawLang = params.get('lang');

  if (rawStart === null && rawTarget === null) return { kind: 'none' };
  if (!rawStart?.trim() || !rawTarget?.trim()) return { kind: 'error', reason: 'missing-title' };

  const lang = rawLang ?? 'en';
  if (!isSupportedLang(lang)) return { kind: 'error', reason: 'invalid-lang' };
  if (!isValidTitle(rawStart) || !isValidTitle(rawTarget)) return { kind: 'error', reason: 'invalid-title' };
  if (titlesEqual(rawStart, rawTarget)) return { kind: 'error', reason: 'same-article' };

  return { kind: 'ok', challenge: { lang, start: normalizeTitle(rawStart), target: normalizeTitle(rawTarget) } };
}

export function challengeSearch(challenge: Challenge): string {
  const params = new URLSearchParams({
    lang: challenge.lang,
    start: normalizeTitle(challenge.start),
    target: normalizeTitle(challenge.target),
  });
  return `?${params.toString()}`;
}

/** `appRoot` is the absolute URL of the deployed app, e.g. https://user.github.io/repo/ */
export function buildChallengeUrl(challenge: Challenge, appRoot: string): string {
  const url = new URL(appRoot);
  url.search = challengeSearch(challenge);
  url.hash = '';
  return url.toString();
}

export function currentAppRoot(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}
