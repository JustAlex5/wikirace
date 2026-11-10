import { useState, type FormEvent } from 'react';
import { pickRandomChallenge } from '../game/challenges';
import { formatDuration } from '../game/format';
import type { ChallengeParamsResult } from '../game/shareUrl';
import type { Stats } from '../game/stats';
import type { Challenge } from '../game/types';
import type { Strings } from '../i18n';
import type { WikiClient } from '../wiki/client';
import { isValidTitle, titlesEqual } from '../wiki/titles';
import { SUPPORTED_LANGUAGES, type Lang } from '../wiki/types';
import { ArticleSearchInput } from './ArticleSearchInput';
import { Icon } from './Icon';

interface StartScreenProps {
  lang: Lang;
  strings: Strings;
  invite: ChallengeParamsResult;
  stats: Stats;
  statsPersistent: boolean;
  client: Pick<WikiClient, 'search'>;
  onLangChange: (lang: Lang) => void;
  onStart: (challenge: Challenge) => void;
  onResetStats: () => void;
}

export function StartScreen(props: StartScreenProps) {
  const { lang, strings, invite, stats, statsPersistent, client, onLangChange, onStart, onResetStats } = props;
  const [random, setRandom] = useState<Challenge>(() => pickRandomChallenge(lang));
  const [customStart, setCustomStart] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const changeLang = (next: Lang) => {
    if (next === lang) return;
    onLangChange(next);
    setRandom(pickRandomChallenge(next));
    setCustomStart('');
    setCustomTarget('');
    setCustomError(null);
  };

  const submitCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidTitle(customStart) || !isValidTitle(customTarget)) {
      setCustomError(strings.pickBoth);
      return;
    }
    if (titlesEqual(customStart, customTarget)) {
      setCustomError(strings.sameArticle);
      return;
    }
    setCustomError(null);
    onStart({ lang, start: customStart, target: customTarget });
  };

  const recent = stats.history.slice(0, 5);

  return (
    <div className="start-screen">
      <header className="hero">
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true">W</span>
          <h1 className="brand-name">WikiRace</h1>
        </div>
        <p className="hero-tagline">{strings.tagline}</p>
        <div className="segmented" role="group" aria-label={strings.languageLabel}>
          {SUPPORTED_LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={code === lang ? 'segment is-selected' : 'segment'}
              aria-pressed={code === lang}
              onClick={() => changeLang(code)}
            >
              {strings.languageNames[code]}
            </button>
          ))}
        </div>
      </header>

      {invite.kind === 'ok' && (
        <section className="card card-invite" aria-labelledby="invite-title">
          <h2 id="invite-title" className="card-title">
            <Icon name="flag" size={18} /> {strings.sharedChallenge}
          </h2>
          <ChallengePair challenge={invite.challenge} strings={strings} />
          <button type="button" className="button button-primary" onClick={() => onStart(invite.challenge)}>
            {strings.startRace}
          </button>
        </section>
      )}
      {invite.kind === 'error' && <p className="banner banner-error">{strings.sharedInvalid}</p>}

      <div className="card-grid">
        <section className="card" aria-labelledby="random-title">
          <h2 id="random-title" className="card-title">
            {strings.randomTitle}
          </h2>
          <p className="card-description">{strings.randomDescription}</p>
          <ChallengePair challenge={random} strings={strings} />
          <div className="card-actions">
            <button type="button" className="button button-primary" onClick={() => onStart(random)}>
              {strings.startRace}
            </button>
            <button type="button" className="button" onClick={() => setRandom(pickRandomChallenge(lang, Math.random, random))}>
              <Icon name="shuffle" size={16} />
              {strings.shuffle}
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="custom-title">
          <h2 id="custom-title" className="card-title">
            {strings.customTitle}
          </h2>
          <p className="card-description">{strings.customDescription}</p>
          <form className="custom-form" onSubmit={submitCustom} noValidate>
            <ArticleSearchInput
              key={`start-${lang}`}
              lang={lang}
              label={strings.startLabel}
              value={customStart}
              strings={strings}
              client={client}
              onChange={setCustomStart}
            />
            <button
              type="button"
              className="icon-button swap-button"
              onClick={() => {
                setCustomStart(customTarget);
                setCustomTarget(customStart);
              }}
              aria-label={strings.swap}
              title={strings.swap}
            >
              <Icon name="swap" size={16} />
            </button>
            <ArticleSearchInput
              key={`target-${lang}`}
              lang={lang}
              label={strings.targetLabel}
              value={customTarget}
              strings={strings}
              client={client}
              onChange={setCustomTarget}
            />
            {customError && (
              <p className="field-error" role="alert">
                {customError}
              </p>
            )}
            <button type="submit" className="button button-primary">
              {strings.startRace}
            </button>
          </form>
        </section>
      </div>

      <div className="card-grid">
        <section className="card card-plain" aria-labelledby="rules-title">
          <h2 id="rules-title" className="card-title">
            {strings.howToPlay}
          </h2>
          <ol className="rules">
            {strings.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </section>

        <section className="card card-plain" aria-labelledby="stats-title">
          <h2 id="stats-title" className="card-title">
            {strings.statsTitle}
          </h2>
          <dl className="stats-grid">
            <div>
              <dt>{strings.gamesPlayed}</dt>
              <dd className="tabular">{stats.gamesPlayed}</dd>
            </div>
            <div>
              <dt>{strings.gamesCompleted}</dt>
              <dd className="tabular">{stats.gamesCompleted}</dd>
            </div>
            <div>
              <dt>{strings.bestMoves}</dt>
              <dd className="tabular">{stats.bestMoves ?? '–'}</dd>
            </div>
            <div>
              <dt>{strings.bestTime}</dt>
              <dd className="tabular">{stats.bestTimeMs === null ? '–' : formatDuration(stats.bestTimeMs)}</dd>
            </div>
          </dl>
          <h3 className="card-subtitle">{strings.recentWins}</h3>
          {recent.length === 0 ? (
            <p className="muted">{strings.noWins}</p>
          ) : (
            <ul className="recent-list">
              {recent.map((game) => (
                <li key={game.completedAt}>
                  <button
                    type="button"
                    className="link-button"
                    lang={game.lang}
                    onClick={() => onStart({ lang: game.lang, start: game.start, target: game.target })}
                  >
                    <bdi>{game.start}</bdi> <span aria-hidden="true">→</span> <bdi>{game.target}</bdi>
                  </button>
                  <span className="muted tabular">
                    {strings.movesCount(game.moves)} · {formatDuration(game.durationMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!statsPersistent && <p className="muted small">{strings.statsNotSaved}</p>}
          {stats.gamesPlayed > 0 && (
            <button type="button" className="link-button small" onClick={onResetStats}>
              {strings.resetStats}
            </button>
          )}
        </section>
      </div>

      <footer className="site-footer">{strings.footer}</footer>
    </div>
  );
}

function ChallengePair({ challenge, strings }: { challenge: Challenge; strings: Strings }) {
  return (
    <div className="challenge-pair" lang={challenge.lang}>
      <div className="challenge-end">
        <span className="challenge-label">{strings.start}</span>
        <bdi className="challenge-title">{challenge.start}</bdi>
      </div>
      <span className="challenge-arrow" aria-hidden="true">→</span>
      <div className="challenge-end is-target">
        <span className="challenge-label">{strings.target}</span>
        <bdi className="challenge-title">{challenge.target}</bdi>
      </div>
    </div>
  );
}
