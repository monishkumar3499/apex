'use client';

import * as React from 'react';
import { Search, Library, ShieldCheck } from 'lucide-react';
import { Card, Badge, EmptyState } from './ui';
import { ResourcePanel, type Resource } from './resource-panel';
import { cn } from '../lib/utils';

export interface LibraryResource extends Resource {
  description: string | null;
  score: number;
  views: number;
  topics: string[];
}

const FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'video', label: 'Video' },
  { value: 'doc', label: 'Docs' },
  { value: 'article', label: 'Articles' },
  { value: 'course', label: 'Courses' },
  { value: 'paper', label: 'Papers' },
];

export function LibraryView({ resources }: { resources: LibraryResource[] }) {
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    resources.forEach((r) => {
      const key = r.kind === 'playlist' ? 'video' : r.kind;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [resources]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      const kind = r.kind === 'playlist' ? 'video' : r.kind;
      if (filter !== 'all' && kind !== filter) return false;
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
        icon={<Library className="h-5 w-5" />}
        title="No resources yet"
        description="Resources are attached while your plan builds."
      />
    );
  }

  return (
    <div className="animate-in">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Library</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span>{resources.length} resources across your plan.</span>
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <ShieldCheck className="h-3.5 w-3.5" />
          Every link fetched from a live source
        </span>
      </p>

      {/* --------------------------------------------------------- controls */}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, channels, topics…"
            className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((option) => {
          const count = option.value === 'all' ? resources.length : counts.get(option.value) ?? 0;
          if (count === 0 && option.value !== 'all') return null;
          return (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === option.value
                  ? 'border-accent bg-accent/12 text-accent'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {option.label}
              <span className="tabular ml-1.5 text-ink-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------- resources */}
      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a different search or filter." />
        ) : (
          visible.map((resource) => (
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
          ))
        )}
      </div>
    </div>
  );
}
