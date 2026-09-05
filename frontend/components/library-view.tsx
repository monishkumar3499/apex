'use client';

import * as React from 'react';
import { Search, Library, ShieldCheck, X } from 'lucide-react';
import {
  Button, Card, Badge, EmptyState, PageHeader, Input, Segmented, FadeIn,
  type SegmentedOption,
} from './ui';
import { ResourcePanel, type Resource } from './resource-panel';
import { cn } from '../lib/utils';

export interface LibraryResource extends Resource {
  description: string | null;
  score: number;
  views: number;
  topics: string[];
}

type Filter = 'all' | 'video' | 'doc' | 'article' | 'course' | 'paper';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'video', label: 'Video' },
  { value: 'doc', label: 'Docs' },
  { value: 'article', label: 'Articles' },
  { value: 'course', label: 'Courses' },
  { value: 'paper', label: 'Papers' },
];

/** Playlists are videos as far as a learner filtering the shelf is concerned. */
const normalise = (kind: string) => (kind === 'playlist' ? 'video' : kind);

export function LibraryView({
  resources,
  topics = [],
  initialQuery = '',
}: {
  resources: LibraryResource[];
  /** Every topic in the plan, in syllabus order. Drives the topic filter row. */
  topics?: string[];
  /** From `?q=` — the map links here with a topic title pre-filled. */
  initialQuery?: string;
}) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState(initialQuery);

  /**
   * The exact topic being filtered on, when the query matches one.
   *
   * Kept separate from free-text search so a topic filter is *exact*: a topic
   * called "Trees" should not also match "Binary search trees". A substring
   * search is right for typing and wrong for clicking a chip.
   */
  const [topicFilter, setTopicFilter] = React.useState<string | null>(
    initialQuery && topics.includes(initialQuery) ? initialQuery : null,
  );

  /**
   * Topics that actually have something attached, in syllabus order.
   *
   * A chip that filters to nothing is a dead end, so the row shows only topics
   * with at least one resource — and the count tells the learner what they will
   * get before they click.
   */
  const topicCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    resources.forEach((r) => r.topics.forEach((t) => map.set(t, (map.get(t) ?? 0) + 1)));
    return topics.filter((t) => map.has(t)).map((t) => ({ title: t, count: map.get(t) ?? 0 }));
  }, [resources, topics]);

  const pickTopic = (title: string) => {
    const next = topicFilter === title ? null : title;
    setTopicFilter(next);
    setQuery(next ?? '');
  };

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    resources.forEach((r) => {
      const key = normalise(r.kind);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [resources]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (filter !== 'all' && normalise(r.kind) !== filter) return false;
      // An exact topic match when a chip is active, substring when typing.
      if (topicFilter) return r.topics.includes(topicFilter);
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.author ?? '').toLowerCase().includes(q) ||
        r.topics.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [resources, filter, query, topicFilter]);

  if (!resources.length) {
    return (
      <EmptyState
        icon={<Library />}
        title="No resources yet"
        description="Resources are attached while your plan builds."
      />
    );
  }

  const options: Array<SegmentedOption<Filter>> = FILTERS.flatMap((option) => {
    const count = option.value === 'all' ? resources.length : counts.get(option.value) ?? 0;
    // A filter that would return nothing is not a choice, it is a dead end.
    if (count === 0 && option.value !== 'all') return [];
    return [{ value: option.value, label: option.label, count }];
  });

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title="Library"
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{resources.length} resources across your plan.</span>
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <ShieldCheck className="h-3.5 w-3.5" />
                Every link fetched from a live source
              </span>
            </span>
          }
        />
      </FadeIn>

      {/* --------------------------------------------------------- controls */}
      <FadeIn delay={0.05}>
        <div className="space-y-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Typing supersedes a chip: leaving both active would silently
                // apply an exact filter the search box appears to control.
                setTopicFilter(null);
              }}
              placeholder="Search titles, channels, topics…"
              aria-label="Search resources"
              className="pl-10 pr-10"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setTopicFilter(null);
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-glass/[0.12] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Scrolls rather than wrapping on a phone: six filter chips wrap to
              three lines and push the shelf itself off the screen. */}
          <Segmented
            scroll
            ariaLabel="Filter by resource type"
            value={filter}
            onChange={setFilter}
            options={options}
            className="scroll-fade-x sm:[mask-image:none]"
          />

          {/*
            Filter by topic.

            The Library holds every resource in the plan, and the question a
            learner actually arrives with is "what have I got for *this* topic" —
            which previously required knowing the topic's exact wording and
            typing it. A horizontal scroller rather than a wrapped block: on a
            26-week plan there are eighty of these, and wrapping them would bury
            the shelf under its own filter.
          */}
          {topicCounts.length > 0 && (
            <div>
              <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-faint">
                By topic
              </p>
              <div
                role="group"
                aria-label="Filter by topic"
                className="scroll-x scroll-fade-x -mx-1 flex gap-1.5 px-1 pb-1"
              >
                {topicCounts.map(({ title, count }) => {
                  const active = topicFilter === title;
                  return (
                    <button
                      key={title}
                      type="button"
                      onClick={() => pickTopic(title)}
                      aria-pressed={active}
                      className={cn(
                        'flex min-h-touch shrink-0 items-center gap-1.5 rounded-field border px-2.5 text-xs',
                        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60',
                        active
                          ? 'border-accent/50 bg-accent/12 text-accent shadow-glow'
                          : 'border-glass-edge/[0.09] text-ink-muted hover:border-accent/25 hover:text-ink',
                      )}
                    >
                      <span className="max-w-[14rem] truncate">{title}</span>
                      <span className="font-mono text-2xs text-ink-faint">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </FadeIn>

      {/* -------------------------------------------------------- resources */}
      <FadeIn delay={0.1}>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Nothing matches"
            description={
              topicFilter
                ? `Nothing is attached to "${topicFilter}" under this type filter.`
                : 'Try a different search term, or widen the filter.'
            }
            action={
              query || topicFilter || filter !== 'all' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setTopicFilter(null);
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p aria-live="polite" className="sr-only">
              {visible.length} resources shown
            </p>
            {/*
              Two columns from `xl` up. A single column of 100px-tall rows on a
              27" monitor is mostly whitespace, and the shelf is the one screen
              where scanning many items at once is the whole job.
            */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {visible.map((resource) => (
                <Card key={resource.id} className="overflow-hidden p-3">
                  <ResourcePanel resource={resource} className="border-0 bg-transparent" />

                  {(resource.topics.length > 0 || resource.description) && (
                    <div className="px-3 pb-1 pt-2">
                      {resource.description && (
                        <p className="line-clamp-2 font-reading text-xs leading-relaxed text-ink-muted">
                          {resource.description}
                        </p>
                      )}
                      {resource.topics.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {/*
                            The badges are the filter, not a label. Seeing which
                            topic a resource belongs to and then having to scroll
                            back up to filter by it is the kind of gap that makes
                            a shelf feel inert.
                          */}
                          {resource.topics.slice(0, 4).map((topic) => (
                            <button
                              key={topic}
                              type="button"
                              onClick={() => pickTopic(topic)}
                              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                            >
                              <Badge
                                tone={topicFilter === topic ? 'accent' : 'muted'}
                                className="transition-colors hover:border-accent/30 hover:text-accent"
                              >
                                {topic}
                              </Badge>
                            </button>
                          ))}
                          {resource.topics.length > 4 && (
                            <Badge tone="muted">+{resource.topics.length - 4}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </FadeIn>
    </div>
  );
}
