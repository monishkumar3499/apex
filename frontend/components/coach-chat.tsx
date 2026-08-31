'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Square, Compass, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

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
    setMessages((m) => [
      ...m,
      { id: `local-${Date.now()}`, role: 'user', content: question },
    ]);
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

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-5rem)]">
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="space-y-6">
          {visible.map((message) => (
            <Bubble key={message.id} role={message.role} content={message.content} />
          ))}

          {draft && <Bubble role="assistant" content={draft} streaming />}

          {streaming && !draft && (
            <div className="flex gap-3">
              <Avatar />
              <div className="flex items-center gap-1 pt-2.5">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ------------------------------------------------------ composer */}
      <div className="shrink-0 pt-3">
        {visible.length <= 1 && !streaming && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => send(suggestion)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                <Sparkles className="h-3 w-3" />
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="surface flex items-end gap-2 rounded-2xl p-2">
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
            placeholder="Ask about a concept, a problem you're stuck on, or your pace…"
            className="max-h-48 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-ink-faint"
          />

          {streaming ? (
            <button
              onClick={stop}
              aria-label="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-muted transition-colors hover:text-ink"
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-all hover:bg-accent-hover disabled:opacity-35"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <p className="mt-2 text-center text-2xs text-ink-faint">
          The coach has your whole plan in context. It can be wrong — verify anything that matters.
        </p>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
      <Compass className="h-4 w-4" />
    </div>
  );
}

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
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/12 px-4 py-2.5 text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar />
      <div
        className={cn(
          'min-w-0 flex-1 text-sm leading-relaxed',
          '[&_p]:my-2.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
          '[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_li]:my-1',
          '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:font-display [&_h1]:text-base [&_h1]:font-semibold',
          '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold',
          '[&_h3]:mb-1.5 [&_h3]:mt-3.5 [&_h3]:font-semibold',
          '[&_strong]:font-semibold [&_strong]:text-ink',
          '[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
          '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-2 [&_pre]:p-3.5',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
          '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
          '[&_table]:my-3 [&_table]:w-full [&_table]:text-xs',
          '[&_th]:border [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left',
          '[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5',
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent" />
        )}
      </div>
    </div>
  );
}
