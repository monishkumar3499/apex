import type { YouTubeItem } from '../tools/youtube';
import type { WebResult } from '../tools/tavily';
import { canonicalUrl } from './text';

/**
 * Resource quality scoring.
 *
 * Everything here is computed from real API metadata — view counts, like
 * ratios, publish dates, domains — never from a model's opinion. A model
 * cannot know that a video has 2M views and a 4% like rate; the API does.
 */

export type Curated = {
  kind: 'video' | 'playlist' | 'article' | 'doc' | 'book' | 'course' | 'practice' | 'paper';
  title: string;
  url: string;
  source: string;
  author: string;
  description: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  publishedAt: string | null;
  metrics: Record<string, number | string>;
  score: number;
  why: string;
};

/** Domains that carry inherent authority for technical/exam study. */
const DOMAIN_WEIGHTS: Array<[RegExp, number, string]> = [
  [/(^|\.)docs\./i, 0.95, 'Official documentation'],
  [/(^|\.)developer\./i, 0.9, 'Vendor developer docs'],
  [/\.edu(\/|$)/i, 0.92, 'University courseware'],
  [/(^|\.)ocw\.mit\.edu/i, 1.0, 'MIT OpenCourseWare'],
  [/(^|\.)arxiv\.org/i, 0.85, 'Primary research'],
  [/(^|\.)github\.com/i, 0.8, 'Reference implementation'],
  [/(^|\.)wikipedia\.org/i, 0.7, 'Conceptual overview'],
  [/(^|\.)geeksforgeeks\.org/i, 0.62, 'Worked examples'],
  [/(^|\.)freecodecamp\.org/i, 0.75, 'Long-form tutorial'],
  [/(^|\.)khanacademy\.org/i, 0.82, 'Structured fundamentals'],
  [/(^|\.)coursera\.org|udemy\.com|edx\.org/i, 0.78, 'Structured course'],
  [/(^|\.)medium\.com|dev\.to|substack\.com/i, 0.45, 'Practitioner write-up'],
];

function domainScore(url: string): { weight: number; why: string; kind: Curated['kind'] } {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* keep default */ }

  for (const [pattern, weight, why] of DOMAIN_WEIGHTS) {
    if (pattern.test(host) || pattern.test(url)) {
      const kind: Curated['kind'] =
        /docs\.|developer\.|\.edu|ocw\./i.test(host) ? 'doc'
        : /arxiv/i.test(host) ? 'paper'
        : /coursera|udemy|edx/i.test(host) ? 'course'
        : 'article';
      return { weight, why, kind };
    }
  }
  return { weight: 0.5, why: 'Relevant write-up', kind: 'article' };
}

/** 0..1, peaking for the 12–75 minute range that suits one study block. */
function durationFit(seconds: number): number {
  if (!seconds) return 0.5;
  const minutes = seconds / 60;
  if (minutes < 3) return 0.15;          // shorts / teasers
  if (minutes < 8) return 0.55;
  if (minutes <= 75) return 1.0;         // ideal single-sitting lesson
  if (minutes <= 180) return 0.8;        // full lecture
  if (minutes <= 420) return 0.6;        // marathon course video
  return 0.4;
}

/** Recency decay with a long half-life — fundamentals age slowly. */
function recencyFit(publishedAt: string): number {
  if (!publishedAt) return 0.6;
  const years = (Date.now() - new Date(publishedAt).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 0) return 0.8;
  return Math.max(0.35, Math.exp(-years / 6));
}

/** Log-compressed popularity so a 10M-view video doesn't dwarf everything. */
function popularityFit(views: number): number {
  if (views <= 0) return 0.3;
  return Math.min(1, Math.log10(views + 10) / 6.5); // 3M views ≈ 1.0
}

/** Likes per view. Above ~3% is strong for educational content. */
function engagementFit(views: number, likes: number): number {
  if (!views || !likes) return 0.5;
  const ratio = likes / views;
  return Math.min(1, ratio / 0.04);
}

export function scoreYouTube(item: YouTubeItem, relevance: number): Curated {
  const duration = durationFit(item.durationSec);
  const recency = recencyFit(item.publishedAt);
  const popularity = popularityFit(item.views);
  const engagement = engagementFit(item.views, item.likes);

  const score =
    relevance * 0.34 +
    popularity * 0.20 +
    engagement * 0.18 +
    duration * 0.16 +
    recency * 0.12;

  const reasons: string[] = [];
  if (item.kind === 'playlist') reasons.push(`${item.itemCount ?? 0}-part series`);
  if (item.views > 250_000) reasons.push(`${(item.views / 1e6).toFixed(1)}M views`);
  else if (item.views > 20_000) reasons.push(`${Math.round(item.views / 1000)}K views`);
  if (engagement > 0.75) reasons.push('exceptional like ratio');
  if (item.durationSec >= 720 && item.durationSec <= 4500) reasons.push('fits one study block');
  if (recency > 0.85) reasons.push('recently published');

  return {
    kind: item.kind,
    title: item.title,
    url: canonicalUrl(item.url),
    source: 'youtube',
    author: item.channelTitle,
    description: item.description,
    thumbnailUrl: item.thumbnail || null,
    durationSec: item.durationSec || null,
    publishedAt: item.publishedAt || null,
    metrics: { views: item.views, likes: item.likes, itemCount: item.itemCount ?? 0 },
    score: Number(score.toFixed(4)),
    why: reasons.slice(0, 3).join(' · ') || `From ${item.channelTitle}`,
  };
}

export function scoreWeb(item: WebResult, relevance: number): Curated {
  const { weight, why, kind } = domainScore(item.url);
  const recency = recencyFit(item.publishedDate ?? '');

  const score =
    relevance * 0.36 +
    weight * 0.34 +
    Math.min(1, item.score) * 0.18 +
    recency * 0.12;

  let host = item.url;
  try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* noop */ }

  return {
    kind,
    title: item.title,
    url: canonicalUrl(item.url),
    source: 'web',
    author: host,
    description: item.content,
    thumbnailUrl: null,
    durationSec: null,
    publishedAt: item.publishedDate ?? null,
    metrics: { tavily: item.score },
    score: Number(score.toFixed(4)),
    why,
  };
}

/** Drop near-duplicates: same URL, same video id, or near-identical titles. */
export function dedupe(items: Curated[]): Curated[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Curated[] = [];

  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    const urlKey = item.url.toLowerCase();
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (!urlKey || seenUrl.has(urlKey) || (titleKey && seenTitle.has(titleKey))) continue;
    seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(item);
  }
  return out;
}
