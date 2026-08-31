import { logger } from '../logger/pino';

/**
 * YouTube Data API v3.
 *
 * Quota discipline matters here: `search.list` costs 100 units against a
 * 10,000/day default quota (≈100 searches), while `videos.list` costs 1.
 * So we search once per *unit* (not per topic), then hydrate every returned id
 * in a single batched details call to get duration and engagement stats.
 */

export interface YouTubeItem {
  kind: 'video' | 'playlist';
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
  durationSec: number;
  views: number;
  likes: number;
  itemCount?: number;
}

const API = 'https://www.googleapis.com/youtube/v3';

/** ISO-8601 duration (PT1H2M10S) → seconds. */
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (+(d || 0) * 86400) + (+(h || 0) * 3600) + (+(min || 0) * 60) + +(s || 0);
}

async function call(path: string, params: Record<string, string>): Promise<any> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');

  const url = new URL(`${API}/${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`YouTube ${path} ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

/**
 * Search videos and hydrate them with real duration + engagement metrics.
 * `maxResults` is capped at 25 — beyond that the marginal result quality
 * drops faster than the ranking can compensate.
 */
export async function searchVideos(query: string, maxResults = 10): Promise<YouTubeItem[]> {
  try {
    const search = await call('search', {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(Math.min(maxResults, 25)),
      relevanceLanguage: 'en',
      videoEmbeddable: 'true',
      order: 'relevance',
    });

    const ids: string[] = (search.items ?? [])
      .map((i: any) => i.id?.videoId)
      .filter(Boolean);
    if (!ids.length) return [];

    // 1 quota unit for the whole batch, vs 100 for another search.
    const details = await call('videos', {
      part: 'snippet,contentDetails,statistics',
      id: ids.join(','),
      maxResults: String(ids.length),
    });

    return (details.items ?? []).map((v: any): YouTubeItem => ({
      kind: 'video',
      id: v.id,
      title: v.snippet?.title ?? '',
      description: (v.snippet?.description ?? '').slice(0, 400),
      channelTitle: v.snippet?.channelTitle ?? '',
      channelId: v.snippet?.channelId ?? '',
      publishedAt: v.snippet?.publishedAt ?? '',
      thumbnail:
        v.snippet?.thumbnails?.medium?.url ??
        v.snippet?.thumbnails?.default?.url ??
        `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      durationSec: parseDuration(v.contentDetails?.duration ?? ''),
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
    }));
  } catch (error) {
    logger.error({ error, query }, 'YouTube video search failed');
    return [];
  }
}

/** Playlists are the highest-value resource for long-horizon prep. */
export async function searchPlaylists(query: string, maxResults = 5): Promise<YouTubeItem[]> {
  try {
    const search = await call('search', {
      part: 'snippet',
      q: query,
      type: 'playlist',
      maxResults: String(Math.min(maxResults, 10)),
      relevanceLanguage: 'en',
    });

    const ids: string[] = (search.items ?? []).map((i: any) => i.id?.playlistId).filter(Boolean);
    if (!ids.length) return [];

    const details = await call('playlists', {
      part: 'snippet,contentDetails',
      id: ids.join(','),
      maxResults: String(ids.length),
    });

    return (details.items ?? []).map((p: any): YouTubeItem => ({
      kind: 'playlist',
      id: p.id,
      title: p.snippet?.title ?? '',
      description: (p.snippet?.description ?? '').slice(0, 400),
      channelTitle: p.snippet?.channelTitle ?? '',
      channelId: p.snippet?.channelId ?? '',
      publishedAt: p.snippet?.publishedAt ?? '',
      thumbnail:
        p.snippet?.thumbnails?.medium?.url ??
        p.snippet?.thumbnails?.default?.url ??
        '',
      url: `https://www.youtube.com/playlist?list=${p.id}`,
      durationSec: 0,
      views: 0,
      likes: 0,
      itemCount: p.contentDetails?.itemCount ?? 0,
    }));
  } catch (error) {
    logger.error({ error, query }, 'YouTube playlist search failed');
    return [];
  }
}

export function videoIdFromUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = p.exec(url);
    if (m) return m[1];
  }
  return null;
}

export function playlistIdFromUrl(url: string): string | null {
  const m = /[?&]list=([\w-]+)/.exec(url);
  return m ? m[1] : null;
}
