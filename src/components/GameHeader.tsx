import { useLayoutEffect, useRef } from 'react';
import type { GameState } from '../game/types';
import { formatDuration } from '../game/format';
import { useElapsed } from '../hooks/useElapsed';
import type { Strings } from '../i18n';
import { Icon } from './Icon';
import { PathTrail } from './PathTrail';

interface GameHeaderProps {
  state: GameState;
  strings: Strings;
  onBack: () => void;
  onSelectStep: (index: number) => void;
  onRestart: () => void;
  onNewChallenge: () => void;
}

function ElapsedTime({ startedAt, finishedAt }: { startedAt: number | null; finishedAt: number | null }) {
  const elapsed = useElapsed(startedAt, finishedAt);
  return <span className="stat-value tabular">{formatDuration(elapsed)}</span>;
}

/** Exposes the sticky header height as --header-height so anchors scroll below it. */
function useHeaderHeightVariable() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--header-height', `${element.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);
  return ref;
}

export function GameHeader({ state, strings, onBack, onSelectStep, onRestart, onNewChallenge }: GameHeaderProps) {
  const headerRef = useHeaderHeightVariable();
  const start = state.start ?? state.challenge?.start ?? '';
  const target = state.target ?? state.challenge?.target ?? '';
  const playing = state.status === 'playing';
  const loading = state.pending !== null || state.status === 'starting';

  return (
    <header className="game-header" ref={headerRef}>
      <div className="game-header-inner">
        <div className="header-row">
          <a className="brand" href={import.meta.env.BASE_URL} onClick={(event) => {
            event.preventDefault();
            onNewChallenge();
          }}>
            <span className="brand-mark" aria-hidden="true">W</span>
            <span className="brand-name">WikiRace</span>
          </a>

          <div className="matchup">
            <span className="matchup-item" title={`${strings.start}: ${start}`}>
              <span className="matchup-label">{strings.start}</span>
              <bdi className="matchup-title">{start}</bdi>
            </span>
            <span className="matchup-arrow" aria-hidden="true">→</span>
            <span className="matchup-item is-target" title={`${strings.target}: ${target}`}>
              <span className="matchup-label">
                <Icon name="target" size={12} /> {strings.target}
              </span>
              <bdi className="matchup-title">{target}</bdi>
            </span>
          </div>

          <div className="header-stats" aria-live="off">
            <div className="stat">
              <span className="stat-label">{strings.moves}</span>
              <span className="stat-value tabular" data-testid="move-counter">{state.moves}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{strings.time}</span>
              <ElapsedTime startedAt={state.startedAt} finishedAt={state.finishedAt} />
            </div>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="icon-button"
              onClick={onBack}
              disabled={!playing || state.pathIndex === 0}
              title={strings.back}
              aria-label={strings.back}
            >
              <Icon name="back" className="flip-rtl" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onRestart}
              disabled={state.status === 'starting' || state.challenge === null}
              title={strings.restart}
              aria-label={strings.restart}
            >
              <Icon name="restart" />
            </button>
            <button type="button" className="button button-small" onClick={onNewChallenge}>
              <Icon name="shuffle" size={16} />
              <span className="hide-narrow">{strings.newChallenge}</span>
            </button>
          </div>
        </div>

        {state.path.length > 0 && (
          <div className="header-row header-row-trail">
            <span className="trail-label">{strings.path}</span>
            <PathTrail
              path={state.path}
              pathIndex={state.pathIndex}
              target={state.target}
              strings={strings}
              disabled={!playing}
              onSelect={onSelectStep}
            />
            {state.pending?.kind === 'link' && (
              <span className="trail-pending" role="status">
                {strings.loadingArticle(state.pending.title)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={loading ? 'progress-bar is-active' : 'progress-bar'} aria-hidden="true" />
    </header>
  );
}
