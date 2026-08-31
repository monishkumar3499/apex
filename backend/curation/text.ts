/** Lightweight text utilities for deterministic resource↔topic matching. */

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','for','of','to','in','on','at','by','with',
  'from','as','is','are','was','were','be','been','being','it','its','this','that','these','those',
  'you','your','we','our','how','what','why','when','which','can','will','shall','should','would',
  'do','does','did','not','no','yes','all','any','some','more','most','very','using','use','used',
  'tutorial','video','part','full','course','complete','free','best','top','guide','learn','learning',
  'introduction','intro','basics','beginners','beginner','explained','lecture','lectures','series',
]);

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/[\s\-_.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Stable term-frequency map. */
export function termFreq(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach((t) => map.set(t, (map.get(t) ?? 0) + 1));
  return map;
}

/**
 * Cosine similarity over term frequencies. Cheap, order-independent, and good
 * enough to bind a topic like "Clock Domain Crossing" to a video titled
 * "CDC — metastability and synchronizers".
 */
export function similarity(a: string, b: string): number {
  const ta = termFreq(tokenize(a));
  const tb = termFreq(tokenize(b));
  if (!ta.size || !tb.size) return 0;

  let dot = 0;
  ta.forEach((va, term) => {
    const vb = tb.get(term);
    if (vb) dot += va * vb;
  });
  if (!dot) return 0;

  const norm = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));

  return dot / (norm(ta) * norm(tb));
}

/** Fraction of `needles` that appear anywhere in `haystack`. */
export function keywordCoverage(needles: string[], haystack: string): number {
  if (!needles.length) return 0;
  const hay = ` ${tokenize(haystack).join(' ')} `;
  const hit = needles.filter((n) => {
    const parts = tokenize(n);
    return parts.length > 0 && parts.every((p) => hay.includes(` ${p} `));
  });
  return hit.length / needles.length;
}

export function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

/** Normalise a URL so trackers and trailing slashes don't defeat dedupe. */
export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','si','feature','ab_channel']
      .forEach((p) => url.searchParams.delete(p));
    let out = url.toString();
    if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}
