import { logger } from '../logger/pino';

export interface WebResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface SearchOptions {
  maxResults?: number;
  depth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: 'general' | 'news';
}

const EXCLUDED = [
  'pinterest.com',
  'quora.com',
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
];

/** Single Tavily search. Failures degrade to an empty list — never fatal. */
export async function searchWeb(query: string, options: SearchOptions = {}): Promise<WebResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    logger.warn('TAVILY_API_KEY missing — skipping web discovery');
    return [];
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        api_key: apiKey, // accepted by both the legacy and current Tavily auth paths
        query,
        max_results: options.maxResults ?? 8,
        search_depth: options.depth ?? 'basic',
        topic: options.topic ?? 'general',
        include_answer: false,
        include_raw_content: false,
        include_domains: options.includeDomains ?? [],
        exclude_domains: [...EXCLUDED, ...(options.excludeDomains ?? [])],
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status, query }, 'Tavily search failed');
      return [];
    }

    const data = await response.json();
    return (data.results ?? []).map((r: any): WebResult => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: (r.content ?? '').slice(0, 600),
      score: Number(r.score ?? 0),
      publishedDate: r.published_date,
    }));
  } catch (error) {
    logger.error({ error, query }, 'Tavily search threw');
    return [];
  }
}

/** Run several searches concurrently and flatten. Used once per plan build. */
export async function searchWebBatch(queries: string[], options: SearchOptions = {}): Promise<WebResult[]> {
  const batches = await Promise.all(queries.map((q) => searchWeb(q, options)));
  return batches.flat();
}
