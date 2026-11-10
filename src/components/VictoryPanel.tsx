import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../game/format';
import { buildChallengeUrl, currentAppRoot } from '../game/shareUrl';
import type { GameState } from '../game/types';
import type { Strings } from '../i18n';
import { copyText, shareText, type ShareOutcome } from '../share';
import { Icon } from './Icon';

interface VictoryPanelProps {
  state: GameState;
  strings: Strings;
  onRestart: () => void;
  onNewChallenge: () => void;
}

/** Inline (non-modal) summary shown above the target article. */
export function VictoryPanel({ state, strings, onRestart, onNewChallenge }: VictoryPanelProps) {
  const [feedback, setFeedback] = useState<ShareOutcome | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  if (!state.challenge || state.startedAt === null || state.finishedAt === null) return null;

  const time = formatDuration(state.finishedAt - state.startedAt);
  const route = state.path.slice(0, state.pathIndex + 1);
  const routeSteps = route.length - 1;
  const challengeUrl = buildChallengeUrl(state.challenge, currentAppRoot());
  const start = state.start ?? state.challenge.start;
  const target = state.target ?? state.challenge.target;

  const handleShare = async () => {
    setFeedback(await shareText(strings.shareText(start, target, state.moves, time, route, challengeUrl)));
  };
  const handleCopyLink = async () => {
    setFeedback(await copyText(challengeUrl));
  };

  return (
    <section className="victory" aria-labelledby="victory-title">
      <div className="victory-head">
        <Icon name="flag" size={22} className="victory-icon" />
        <h2 id="victory-title" ref={headingRef} tabIndex={-1}>
          {strings.victoryTitle}
        </h2>
      </div>
      <p className="victory-summary">{strings.victorySummary(target, state.moves, time)}</p>

      <dl className="victory-stats">
        <div>
          <dt>{strings.moves}</dt>
          <dd className="tabular">{state.moves}</dd>
        </div>
        <div>
          <dt>{strings.time}</dt>
          <dd className="tabular">{time}</dd>
        </div>
      </dl>

      <h3 className="victory-subtitle">{strings.yourPath}</h3>
      <ol className="victory-path">
        {route.map((title, index) => (
          <li key={`${index}-${title}`}>
            <bdi>{title}</bdi>
          </li>
        ))}
      </ol>
      {state.moves > routeSteps && <p className="victory-note">{strings.backtrackNote(state.moves, routeSteps)}</p>}

      <div className="victory-actions">
        <button type="button" className="button button-primary" onClick={handleShare}>
          <Icon name="share" size={16} />
          {strings.shareResult}
        </button>
        <button type="button" className="button" onClick={handleCopyLink}>
          <Icon name="link" size={16} />
          {strings.copyLink}
        </button>
        <button type="button" className="button" onClick={onRestart}>
          <Icon name="restart" size={16} />
          {strings.playAgain}
        </button>
        <button type="button" className="button" onClick={onNewChallenge}>
          <Icon name="shuffle" size={16} />
          {strings.newChallenge}
        </button>
      </div>
      <p className="victory-feedback" role="status" aria-live="polite">
        {feedback === 'copied' ? strings.copied : feedback === 'failed' ? strings.copyFailed : ''}
      </p>
      {feedback === 'failed' && <input className="input" readOnly value={challengeUrl} onFocus={(e) => e.target.select()} />}
    </section>
  );
}
