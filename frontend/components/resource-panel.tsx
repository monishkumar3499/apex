'use client';

import * as React from 'react';
import { Play, ExternalLink, FileText, BookOpen, GraduationCap, Newspaper, X, Maximize2 } from 'lucide-react';
import { cn, formatMinutes } from '../lib/utils';
import { Badge } from './ui';

export interface Resource {
  id: string;
  kind: 'video' | 'playlist' | 'article' | 'doc' | 'book' | 'course' | 'practice' | 'paper';
  title: string;
  url: string;
  author: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  why: string | null;
}

const KIND_ICON = {
  video: Play,
  playlist: Play,
  article: Newspaper,
  doc: FileText,
  book: BookOpen,
  course: GraduationCap,
  practice: FileText,
  paper: FileText,
} as const;

function youtubeId(url: string): string | null {
  const watch = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(url);
  return watch ? watch[1] : null;
}

function playlistId(url: string): string | null {
  const m = /[?&]list=([\w-]+)/.exec(url);
  return m ? m[1] : null;
}

/**
 * The attached resource for a scheduled item.
 *
 * Video plays inline so a study block never requires leaving the app; anything
 * else opens in a new tab with its provenance shown, because knowing *why*
 * this resource was chosen is what makes a curated list trustworthy.
 */
export function ResourcePanel({ resource, className }: { resource: Resource; className?: string }) {
  const [playing, setPlaying] = React.useState(false);
  const [theatre, setTheatre] = React.useState(false);

  const videoId = youtubeId(resource.url);
  const listId = playlistId(resource.url);
  const embeddable = Boolean(videoId || listId);
  const Icon = KIND_ICON[resource.kind] ?? FileText;

  const embedSrc = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=${listId}&rel=0&modestbranding=1`;

  return (
    <>
      <div className={cn('overflow-hidden rounded-xl border border-line bg-surface-2', className)}>
        {playing && embeddable ? (
          <div className="relative aspect-video bg-black">
            <iframe
              src={embedSrc}
              title={resource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
            <div className="absolute right-2 top-2 flex gap-1.5">
              <button
                onClick={() => setTheatre(true)}
                aria-label="Expand video"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPlaying(false)}
                aria-label="Close video"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 p-3">
            {/* thumbnail / icon */}
            <button
              onClick={() => (embeddable ? setPlaying(true) : window.open(resource.url, '_blank', 'noopener'))}
              className="group relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-3"
              aria-label={embeddable ? `Play ${resource.title}` : `Open ${resource.title}`}
            >
              {resource.thumbnail_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resource.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {embeddable && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/45">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-black">
                        <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink-faint">
                  <Icon className="h-5 w-5" />
                </span>
              )}
            </button>

            {/* meta */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge tone={resource.kind === 'video' || resource.kind === 'playlist' ? 'danger' : 'info'}>
                  {resource.kind}
                </Badge>
                {resource.duration_sec ? (
                  <span className="tabular text-2xs text-ink-faint">
                    {formatMinutes(Math.round(resource.duration_sec / 60))}
                  </span>
                ) : null}
              </div>

              <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{resource.title}</p>

              <div className="mt-1 flex items-center gap-2 text-2xs text-ink-faint">
                {resource.author && <span className="truncate">{resource.author}</span>}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-0.5 transition-colors hover:text-accent"
                >
                  Open
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>

              {resource.why && (
                <p className="mt-1.5 truncate text-2xs italic text-ink-faint">{resource.why}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* theatre mode */}
      {theatre && embeddable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <button
            onClick={() => setTheatre(false)}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black">
            <iframe
              src={embedSrc}
              title={resource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
