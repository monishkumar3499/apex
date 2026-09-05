'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'motion/react';
import { ArrowUp, Square, Sparkles, Play, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { EASE, KairoMark } from './ui';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

export function CoachChat({
  planId,
  initialMessages,
  suggestions,
}: {
  planId: string;
  initialMessages: ChatMessage[];
  suggestions: string[];
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, draft]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || streaming) return;

    setInput('');
    setDraft('');
    setStreaming(true);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: question }]);
    requestAnimationFrame(autosize);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, message: question }),
        signal: controller.signal,
      });

      if (!response.body) throw new Error('No response from the coach');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.delta) {
              answer += payload.delta;
              setDraft(answer);
            }
          } catch {
            /* partial frame */
          }
        }
      }

      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: answer }]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: 'Something went wrong reaching the coach. Try that again.',
          },
        ]);
      } else if (draft) {
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: draft }]);
      }
    } finally {
      setDraft('');
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();
  const visible = messages.filter((m) => m.role !== 'system');
  const empty = visible.length === 0 && !streaming;

  /*
    dvh, not vh: on mobile Safari 100vh includes the address bar, so the
    composer started life below the fold.

    The subtraction now comes from `--workspace-chrome` (see globals.css)
    rather than from three hand-tuned per-breakpoint numbers. Those numbers
    over-reserved by about 3.5rem on a phone, which is why the composer floated
    in the middle of a band of empty space instead of sitting at the bottom of
    the screen the way a chat is expected to.

    `h-sm` still handles a phone in landscape, where the header and composer
    alone eat most of a 400px-tall viewport and the transcript would end up two
    lines high — there, the page scrolls instead of the transcript.
  */
  return (
    <div className="flex h-[calc(100dvh-var(--workspace-chrome))] flex-col h-sm:h-[calc(100dvh-8rem)]">
      <div className="no-chain flex-1 overflow-y-auto pb-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="glass grid h-12 w-12 place-items-center rounded-xl text-accent-vivid shadow-glow">
              <KairoMark className="h-6 w-6" gradient id="coach" />
            </span>
            <h2 className="mt-4 font-display text-base font-semibold tracking-tight">
              Your coach knows this plan
            </h2>
            <p className="mt-1.5 max-w-sm font-reading text-[0.9375rem] leading-relaxed text-ink-muted">
              It can see your schedule, what you have finished, and where you are weakest — and it
              will link the material already in your library. Ask it anything.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {visible.map((message) => (
              <Bubble key={message.id} role={message.role} content={message.content} />
            ))}

            {draft && <Bubble role="assistant" content={draft} streaming />}

            {streaming && !draft && (
              <div className="flex gap-3">
                <Avatar />
                <div className="flex items-center gap-1 pt-2.5" role="status" aria-label="Coach is typing">
                  {[0, 0.15, 0.3].map((delay) => (
                    <motion.span
                      key={delay}
                      className="h-1.5 w-1.5 rounded-full bg-ink-faint"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/*
        ------------------------------------------------------ composer

        Pinned to the bottom by the flex column above it — the transcript takes
        `flex-1`, so this sits on the floor whether there are two messages or
        two hundred. What made it *look* unpinned was the column's own height:
        it reserved ~3.5rem more chrome on a phone than actually exists, so the
        whole thing floated. That is now `--workspace-chrome`.

        The gradient fades the last line of the transcript out behind the
        composer instead of letting text end abruptly against it.
      */}
      <div className="shrink-0 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-3">
        {visible.length <= 1 && !streaming && (
          <div className="scroll-x mb-3 -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => send(suggestion)}
                className={cn(
                  'inline-flex min-h-touch shrink-0 items-center gap-1.5 whitespace-nowrap rounded-field',
                  'glass px-3 py-2 text-xs text-ink-muted',
                  'outline-none transition-colors hover:border-accent/40 hover:text-ink',
                  'focus-visible:ring-2 focus-visible:ring-accent/60 sm:whitespace-normal',
                )}
              >
                <Sparkles className="h-3 w-3 shrink-0 text-accent" />
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'surface flex items-end gap-2 rounded-2xl p-2 transition-[border-color,box-shadow]',
            // The composer is the only input on the screen, so the focus state
            // lives on the whole shell rather than on the bare textarea.
            'focus-within:border-accent/50 focus-within:shadow-glow',
          )}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autosize(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Message the coach"
            placeholder="Ask about a concept, a problem you're stuck on, or your pace…"
            className="max-h-48 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-ink-faint sm:text-sm"
          />

          {streaming ? (
            <button
              onClick={stop}
              aria-label="Stop generating"
              className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted outline-none transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              aria-label="Send"
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg',
                'outline-none transition-all hover:bg-accent-hover active:scale-95',
                'focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                'disabled:opacity-35 disabled:active:scale-100',
              )}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <p className="pb-1 pt-2 text-center text-2xs text-ink-faint">
          Your whole plan is in context, and every link comes from your own library. The coach can
          still be wrong — verify anything that matters.
        </p>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div
      aria-hidden
      className="glass flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-accent-vivid"
    >
      <KairoMark className="h-4 w-4" />
    </div>
  );
}

/**
 * Markdown element overrides.
 *
 * A CSS-only fix cannot contain a wide table: `overflow-x` on the table itself
 * needs `display: block`, which discards the table layout. The scroll has to
 * live on a wrapper, so the wrapper is added here — otherwise a four-column
 * comparison table from the coach makes the whole phone page pan sideways.
 */
/** YouTube links get a play glyph; everything else an out-arrow. */
const isVideoUrl = (href = '') => /youtube\.com|youtu\.be/i.test(href);

const MARKDOWN_COMPONENTS = {
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="scroll-x my-3 -mx-1 px-1">
      <table {...props}>{children}</table>
    </div>
  ),
  /*
    The coach is not the app; its links open away from it.

    They are also rendered as chips rather than as underlined text, because
    nearly every one is now a citation into the learner's own library — a thing
    to click and watch, not a word in a sentence. The leading glyph says which
    kind before the label is read.
  */
  a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex max-w-full items-baseline gap-1 rounded no-underline',
        'text-accent transition-colors hover:text-accent-hover hover:underline hover:underline-offset-2',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
      )}
    >
      {isVideoUrl(href) ? (
        <Play className="h-3 w-3 shrink-0 translate-y-px" fill="currentColor" aria-hidden />
      ) : (
        <ExternalLink className="h-3 w-3 shrink-0 translate-y-px" aria-hidden />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </a>
  ),
};

function Bubble({
  role,
  content,
  streaming,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}) {
  if (role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/20 bg-accent/12 px-4 py-2.5 font-sans text-sm leading-relaxed">
          {content}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar />
      <div
        className={cn(
          'min-w-0 flex-1 leading-relaxed',
          /*
            The reading serif, at a slightly larger size than the UI.

            Coach answers are the longest continuous prose in the app — often
            300 words of explanation — and a UI sans at 14px is tuned for labels
            and buttons, not for paragraphs somebody is trying to learn from.
            Everything structural inside it (code, tables, headings) stays on
            the UI stack below.
          */
          'font-reading text-[0.9375rem] sm:text-base',
          // Capped at a reading measure. On a wide monitor the coach's prose
          // otherwise runs the full width of the workspace column.
          'max-w-measure',
          '[&_p]:my-2.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
          '[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_li]:my-1',
          '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:font-display [&_h1]:text-base [&_h1]:font-semibold',
          '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold',
          '[&_h3]:mb-1.5 [&_h3]:mt-3.5 [&_h3]:font-display [&_h3]:font-semibold',
          // Structure reverts to the UI stack: a serif table header or inline
          // code label reads as a typo rather than as a deliberate choice.
          '[&_table]:font-sans [&_code]:font-mono',
          '[&_strong]:font-semibold [&_strong]:text-ink',
          '[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:break-words',
          '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-sunken [&_pre]:p-3.5',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
          '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
          '[&_table]:my-3 [&_table]:w-full [&_table]:text-xs',
          '[&_th]:border [&_th]:border-line [&_th]:bg-glass/[0.06] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left',
          '[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5',
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {content}
        </ReactMarkdown>
        {streaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent"
          />
        )}
      </div>
    </div>
  );
}
