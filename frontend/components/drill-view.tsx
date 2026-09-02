'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Brain, Play, Loader2, Check, X, RotateCcw, ArrowRight, Sparkles, Lock, TrendingUp,
} from 'lucide-react';
import { Card, Button, Badge, Progress, EmptyState } from './ui';
import { cn } from '../lib/utils';

export interface DrillTopic {
  id: string;
  title: string;
  mastery: number;
  taught: boolean;
  questionCount: number;
}

interface Card_ {
  id: string;
  topic_id: string;
  kind: 'mcq' | 'short' | 'flash';
  stem: string;
  options: string[];
  answer: string;
  explanation: string | null;
  difficulty: number;
  isReview: boolean;
}

type Grade = 'again' | 'hard' | 'good' | 'easy';

const GRADES: Array<{ value: Grade; label: string; hint: string; className: string }> = [
  { value: 'again', label: 'Again', hint: 'Blanked', className: 'border-danger/30 text-danger hover:bg-danger/10' },
  { value: 'hard', label: 'Hard', hint: 'Struggled', className: 'border-warn/30 text-warn hover:bg-warn/10' },
  { value: 'good', label: 'Good', hint: 'Got it', className: 'border-success/30 text-success hover:bg-success/10' },
  { value: 'easy', label: 'Easy', hint: 'Instant', className: 'border-info/30 text-info hover:bg-info/10' },
];

export function DrillView({
  planId, topics, dueCount, initialTopic,
}: {
  planId: string;
  topics: DrillTopic[];
  dueCount: number;
  initialTopic: string | null;
}) {
  const router = useRouter();

  const [cards, setCards] = React.useState<Card_[] | null>(null);
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<Grade[]>([]);
  const [startedAt, setStartedAt] = React.useState<number>(0);
  const [activeTopic, setActiveTopic] = React.useState<string | null>(initialTopic);

  const taught = topics.filter((t) => t.taught);

  const start = async (topicId: string | null) => {
    setLoading(true);
    setActiveTopic(topicId);
    try {
      const response = await fetch('/api/drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, topicId: topicId ?? undefined, limit: 12, generate: Boolean(topicId) }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not load cards');

      if (!body.data.length) {
        toast.info('Nothing to drill here yet — finish a Learn item on this topic first.');
        setLoading(false);
        return;
      }

      setCards(body.data as Card_[]);
      setIndex(0);
      setRevealed(false);
      setSelected(null);
      setResults([]);
      setStartedAt(Date.now());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const grade = async (button: Grade) => {
    if (!cards) return;
    const card = cards[index];
    setResults((r) => [...r, button]);

    // Fire and forget: the learner should never wait between cards.
    void fetch('/api/drill', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, questionId: card.id, button }),
    }).catch(() => undefined);

    if (index + 1 >= cards.length) {
      const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
      void fetch('/api/drill', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, minutes, cards: cards.length }),
      }).then(() => router.refresh());
      setIndex(index + 1);
    } else {
      setIndex(index + 1);
      setRevealed(false);
      setSelected(null);
    }
  };

  /* ------------------------------------------------------------ summary */

  if (cards && index >= cards.length) {
    const correct = results.filter((r) => r === 'good' || r === 'easy').length;
    const accuracy = Math.round((correct / Math.max(1, results.length)) * 100);

    return (
      <div className="animate-in">
        <Card raised className="rounded-panel p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-success/12 text-success">
            <TrendingUp className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold">Session complete</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {results.length} cards · {accuracy}% clean recall
          </p>

          <div className="mx-auto mt-7 grid max-w-sm grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <div key={g.value}>
                <p className="tabular font-display text-lg font-semibold">
                  {results.filter((r) => r === g.value).length}
                </p>
                <p className="text-2xs uppercase tracking-wider text-ink-faint">{g.label}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed text-ink-faint">
            Cards you found hard come back sooner. Cards you found easy will not reappear for weeks —
            that gap is what turns recall into memory.
          </p>

          <div className="mt-7 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => { setCards(null); router.refresh(); }}>
              Back to topics
            </Button>
            <Button onClick={() => start(activeTopic)}>
              <RotateCcw className="h-4 w-4" />
              Another round
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /* --------------------------------------------------------- in session */

  if (cards) {
    const card = cards[index];
    const isCorrect = selected !== null && selected === card.answer;

    return (
      <div className="animate-in">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => setCards(null)}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            End session
          </button>
          <span className="tabular text-sm text-ink-muted">
            {index + 1} / {cards.length}
          </span>
        </div>

        <Progress value={((index) / cards.length) * 100} className="mb-7" />

        <Card raised className="rounded-panel p-5 sm:p-7">
          <div className="flex items-center gap-2">
            {card.isReview ? <Badge tone="info">Review</Badge> : <Badge tone="accent">New</Badge>}
            <span className="text-2xs uppercase tracking-wider text-ink-faint">
              {card.kind === 'mcq' ? 'Multiple choice' : card.kind === 'flash' ? 'Flashcard' : 'Short answer'}
              {' · '}difficulty {card.difficulty}/5
            </span>
          </div>

          <p className="mt-5 whitespace-pre-wrap text-base leading-relaxed sm:text-lg">{card.stem}</p>

          {/* ---------------------------------------------------- options */}
          {card.kind === 'mcq' && card.options.length > 0 && (
            <div className="mt-6 space-y-2">
              {card.options.map((option) => {
                const chosen = selected === option;
                const correct = option === card.answer;
                return (
                  <button
                    key={option}
                    disabled={revealed}
                    onClick={() => { setSelected(option); setRevealed(true); }}
                    className={cn(
                      'flex min-h-touch w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all sm:px-4',
                      !revealed && 'border-line bg-surface-2 hover:border-accent/40',
                      revealed && correct && 'border-success bg-success/10',
                      revealed && chosen && !correct && 'border-danger bg-danger/10',
                      revealed && !correct && !chosen && 'border-line opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs',
                        revealed && correct && 'border-success bg-success text-white',
                        revealed && chosen && !correct && 'border-danger bg-danger text-white',
                        !revealed && 'border-line-strong',
                      )}
                    >
                      {revealed && correct && <Check className="h-3 w-3" strokeWidth={3} />}
                      {revealed && chosen && !correct && <X className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1">{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ------------------------------------------------------ reveal */}
          {card.kind !== 'mcq' && !revealed && (
            <Button className="mt-6" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          )}

          {revealed && (
            <div className="mt-6 animate-in">
              {card.kind !== 'mcq' && (
                <div className="rounded-xl border border-success/25 bg-success/[0.07] p-4">
                  <p className="text-2xs font-medium uppercase tracking-wider text-success">Answer</p>
                  <p className="mt-1.5 text-sm leading-relaxed">{card.answer}</p>
                </div>
              )}

              {card.explanation && (
                <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
                  <p className="text-2xs font-medium uppercase tracking-wider text-ink-faint">Why</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{card.explanation}</p>
                </div>
              )}

              {card.kind === 'mcq' && (
                <p className={cn('mt-3 text-sm font-medium', isCorrect ? 'text-success' : 'text-danger')}>
                  {isCorrect ? 'Correct.' : 'Not quite — read the explanation before grading yourself.'}
                </p>
              )}

              <div className="mt-6">
                <p className="mb-2.5 text-xs text-ink-muted">How well did you know it?</p>
                <div className="grid grid-cols-2 gap-2 xs:grid-cols-4">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => grade(g.value)}
                      className={cn(
                        'min-h-touch rounded-xl border bg-surface-2 px-2 py-3 text-center transition-colors',
                        g.className,
                      )}
                    >
                      <span className="block text-sm font-semibold">{g.label}</span>
                      <span className="mt-0.5 block text-2xs text-ink-faint">{g.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* --------------------------------------------------------- topic list */

  return (
    <div className="animate-in">
      <h1 className="font-display text-fluid-h2 font-semibold">Drill</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Recall practice on what you have already studied, scheduled by spaced repetition.
      </p>

      {dueCount > 0 && (
        <Card className="mt-7 border-accent/30 bg-accent/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {dueCount} card{dueCount === 1 ? '' : 's'} due today
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Clearing these is the highest-value ten minutes available to you right now.
                </p>
              </div>
            </div>
            <Button onClick={() => start(null)} loading={loading && activeTopic === null}>
              <Play className="h-4 w-4" />
              Start review
            </Button>
          </div>
        </Card>
      )}

      <h2 className="mt-9 font-display text-base font-semibold">By topic</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Questions are written the first time you drill a topic, then reused.
      </p>

      <div className="mt-4 space-y-2">
        {taught.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-5 w-5" />}
            title="Nothing unlocked yet"
            description="Finish a Learn item on Today and its topic becomes drillable here. You are never quizzed on material you have not studied."
          />
        ) : (
          topics.map((topic) => (
            <Card
              key={topic.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-3 p-4 transition-colors',
                topic.taught ? 'hover:border-accent/30' : 'opacity-55',
              )}
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="text-sm font-medium">{topic.title}</p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <Progress value={topic.mastery} className="max-w-[7.5rem]" tone={topic.mastery >= 70 ? 'success' : 'accent'} />
                  <span className="tabular text-2xs text-ink-faint">
                    {topic.mastery}% mastery
                    {topic.questionCount > 0 && ` · ${topic.questionCount} cards`}
                  </span>
                </div>
              </div>

              {topic.taught ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => start(topic.id)}
                  loading={loading && activeTopic === topic.id}
                >
                  {topic.questionCount > 0 ? 'Drill' : 'Generate'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-2xs text-ink-faint">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              )}
            </Card>
          ))
        )}
      </div>

      {loading && (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Writing questions for this topic…
        </p>
      )}
    </div>
  );
}
