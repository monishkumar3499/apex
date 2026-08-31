import { logger } from '../logger/pino';

export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
    };
  };
  error?: string;
}

export async function scrapePage(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    logger.error('FIRECRAWL_API_KEY is not defined in environment variables');
    throw new Error('FIRECRAWL_API_KEY is missing');
  }

  logger.info({ url }, 'Scraping page via Firecrawl');

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Firecrawl API returned an error');
      throw new Error(`Firecrawl API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as FirecrawlScrapeResponse;

    if (!result.success || !result.data?.markdown) {
      logger.error({ result }, 'Firecrawl failed to scrape or did not return markdown');
      throw new Error(result.error || 'Firecrawl failed to retrieve markdown content');
    }

    logger.info('Firecrawl scrape completed successfully');
    return result.data.markdown;
  } catch (error) {
    logger.error({ error, url }, 'Failed to scrape page via Firecrawl');
    throw error;
  }
}
