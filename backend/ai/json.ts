/**
 * Tolerant JSON extraction for model output.
 *
 * Even with `response_format: json_object`, open models fence their output,
 * prepend a sentence, emit trailing commas, or get truncated at max_tokens.
 * Repairing here is far cheaper than paying for a retry round-trip, so we
 * only re-ask the model when repair genuinely fails.
 */

/** Pull the outermost balanced {...} or [...] out of a noisy string. */
function sliceBalanced(input: string): string | null {
  const start = input.search(/[{[]/);
  if (start === -1) return null;

  const open = input[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  // Unbalanced — the model was cut off. Close what is still open.
  return null;
}

/** Close dangling strings/brackets on a truncated payload. */
function closeTruncated(input: string): string {
  const start = input.search(/[{[]/);
  if (start === -1) return input;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let out = input.slice(start);
  if (inString) out += '"';

  // Drop a half-written trailing key/value before closing containers.
  out = out.replace(/,\s*"[^"]*"\s*:?\s*$/, '').replace(/,\s*$/, '');

  while (stack.length) out += stack.pop();
  return out;
}

function stripNoise(input: string): string {
  return input
    .replace(/^﻿/, '')
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/```/g, '')
    // <think> blocks from reasoning models
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function repairSyntax(input: string): string {
  return input
    // trailing commas before a closer
    .replace(/,(\s*[}\]])/g, '$1')
    // smart quotes the model borrowed from prose
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // literal newlines inside strings break JSON.parse
    .replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (m, body: string) =>
      m.replace(body, body.replace(/\r?\n/g, '\\n')));
}

export class JsonParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'JsonParseError';
  }
}

/**
 * Parse model output into JSON, trying progressively harder repairs.
 * Throws {@link JsonParseError} carrying the raw text when everything fails.
 */
export function parseModelJson<T = unknown>(raw: string): T {
  const cleaned = stripNoise(raw);

  const candidates = [
    cleaned,
    sliceBalanced(cleaned) ?? '',
    repairSyntax(cleaned),
    repairSyntax(sliceBalanced(cleaned) ?? ''),
    repairSyntax(closeTruncated(cleaned)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the next repair */
    }
  }

  throw new JsonParseError('Model output could not be parsed as JSON', raw.slice(0, 800));
}

/** Best-effort variant for non-critical paths. */
export function tryParseModelJson<T = unknown>(raw: string, fallback: T): T {
  try {
    return parseModelJson<T>(raw);
  } catch {
    return fallback;
  }
}
