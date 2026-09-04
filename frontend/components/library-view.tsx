'use client';

import * as React from 'react';
import { Search, Library, ShieldCheck, X } from 'lucide-react';
import {
  Card, Badge, EmptyState, PageHeader, Input, Segmented, FadeIn, type SegmentedOption,
} from './ui';
import { ResourcePanel, type Resource } from './resource-panel';

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

export function LibraryView({ resources }: { resources: LibraryResource[] }) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');

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
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.author ?? '').toLowerCase().includes(q) ||
        r.topics.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [resources, filter, query]);

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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, channels, topics…"
              aria-label="Search resources"
              className="pl-10 pr-10"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-surface-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
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
        </div>
      </FadeIn>

      {/* -------------------------------------------------------- resources */}
      <FadeIn delay={0.1}>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Nothing matches"
            description="Try a different search term, or widen the filter."
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
                        <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {resource.description}
                        </p>
                      )}
                      {resource.topics.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {resource.topics.slice(0, 4).map((topic) => (
                            <Badge key={topic} tone="muted">{topic}</Badge>
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
