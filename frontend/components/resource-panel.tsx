'use client';

import * as React from 'react';
import { Play, ExternalLink, FileText, BookOpen, GraduationCap, Newspaper, X, Maximize2 } from 'lucide-react';
import { cn, formatMinutes } from '../lib/utils';
import { Badge, Dialog, DialogContent, DialogTitle } from './ui';

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
export function ResourcePanel({
  resource,
  className,
  compact = false,
}: {
  resource: Resource;
  className?: string;
  /**
   * A tighter row for secondary material.
   *
   * Used where a topic's *other* resources are listed under its primary one:
   * at full size, three of them dwarf the resource the day is actually built
   * around and the panel stops reading as a hierarchy. Same affordances, less
   * chrome — the thumbnail shrinks and the "why" line is dropped.
   */
  compact?: boolean;
}) {
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
      <div className={cn('glass overflow-hidden rounded-xl', className)}>
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
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white outline-none backdrop-blur transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPlaying(false)}
                aria-label="Close video"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white outline-none backdrop-blur transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className={cn('flex gap-3', compact ? 'p-2' : 'p-3')}>
            {/* thumbnail / icon */}
            <button
              onClick={() => (embeddable ? setPlaying(true) : window.open(resource.url, '_blank', 'noopener'))}
              className={cn(
                'well group relative shrink-0 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                compact ? 'h-12 w-20' : 'h-16 w-24 xs:w-28',
              )}
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
                      <span
                        className={cn(
                          'flex items-center justify-center rounded-full bg-white/95 text-black shadow-e2 transition-transform duration-200 group-hover:scale-110',
                          compact ? 'h-6 w-6' : 'h-8 w-8',
                        )}
                      >
                        <Play
                          className={cn('ml-0.5', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
                          fill="currentColor"
                        />
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink-faint">
                  <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                </span>
              )}
            </button>

            {/* meta */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={resource.kind === 'video' || resource.kind === 'playlist' ? 'danger' : 'info'}>
                  {resource.kind}
                </Badge>
                {resource.duration_sec ? (
                  <span className="tabular text-2xs text-ink-faint">
                    {formatMinutes(Math.round(resource.duration_sec / 60))}
                  </span>
                ) : null}
              </div>

              <p
                className={cn(
                  'mt-1 font-medium leading-snug',
                  compact ? 'line-clamp-1 text-xs' : 'line-clamp-2 text-sm',
                )}
              >
                {resource.title}
              </p>

              <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-faint">
                {resource.author && <span className="truncate">{resource.author}</span>}
                {/*
                  Padded to a real target. As bare text this link measured
                  42×16 — comfortably under the 44px minimum, and the hardest
                  kind of control to hit, since it sits inline against other
                  text. The negative margin keeps the padding from adding
                  visible space around the row.
                */}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-my-2 inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-2 outline-none transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Open
                  <ExternalLink className="h-2.5 w-2.5" />
                  <span className="sr-only">{resource.title} in a new tab</span>
                </a>
              </div>

              {resource.why && !compact && (
                <p className="mt-1.5 line-clamp-1 text-2xs italic text-ink-faint">{resource.why}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/*
        Theatre mode on the Dialog primitive rather than a bare fixed overlay:
        the previous version left focus behind it, so tabbing out of the video
        landed on the page underneath while the overlay was still covering it.
      */}
      {embeddable && (
        <Dialog open={theatre} onOpenChange={setTheatre}>
          <DialogContent
            showClose
            className={cn(
              'flex max-h-none items-center justify-center border-0 bg-transparent p-0 shadow-none',
              'inset-0 rounded-none pb-0 pt-0',
              'sm:inset-0 sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-6',
              'sm:left-0 sm:top-0',
            )}
          >
            <DialogTitle className="sr-only">{resource.title}</DialogTitle>
            <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-e3">
              <iframe
                src={embedSrc}
                title={resource.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
