'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MoreHorizontal, Trash2, Loader2, AlertTriangle, CalendarClock, ArrowUpRight, CheckCircle2,
} from 'lucide-react';
import {
  Card, Badge, Progress, Button, ConfirmDialog,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from './ui';
import { cn, formatDate, pct } from '../lib/utils';

export interface PlanSummary {
  id: string;
  title: string;
  prep_type: 'exam' | 'skill' | 'hybrid';
  status: 'draft' | 'building' | 'ready' | 'failed' | 'archived' | 'completed';
  start_date: string;
  target_date: string;
  total_items: number;
  done_items: number;
  intake?: { subject?: string } | null;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  building: { label: 'Building', tone: 'accent' },
  ready: { label: 'Active', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  completed: { label: 'Complete', tone: 'info' },
  draft: { label: 'Draft', tone: 'muted' },
};

const TYPE_LABEL: Record<PlanSummary['prep_type'], string> = {
  exam: 'Exam',
  hybrid: 'Cert + role',
  skill: 'Skill',
};

export function PlanCard({
  plan,
  today,
}: {
  plan: PlanSummary;
  today?: { done: number; total: number };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const progress = pct(plan.done_items, plan.total_items);
  const status = STATUS[plan.status] ?? STATUS.draft;
  const daysLeft = Math.ceil(
    (new Date(`${plan.target_date}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );

  const href = plan.status === 'building' ? `/plan/${plan.id}/building` : `/plan/${plan.id}/today`;
  const todayDone = today && today.total > 0 && today.done >= today.total;

  const remove = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/plans/${plan.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not delete this plan');
      toast.success('Plan deleted');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card interactive className="group relative flex h-full flex-col overflow-hidden">
        {/*
          The whole card is the link, via a stretched overlay rather than by
          wrapping the card in an <a>. Wrapping would put the options menu
          button inside the anchor, where a click has to be intercepted and
          cancelled on every browser — and where a screen reader reads the
          menu as part of the plan's link text.
        */}
        <Link
          href={href}
          className="absolute inset-0 z-0 rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <span className="sr-only">Open {plan.title}</span>
        </Link>

        {/*
          Only the head reserves room for the options button. Padding the whole
          card left the progress bar stopping 2rem short of its right edge,
          which reads as a misalignment rather than as a gutter.
        */}
        <div className="pointer-events-none relative z-[1] flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 pr-9">
            <Badge tone={status.tone}>
              {plan.status === 'building' && <Loader2 className="animate-spin" />}
              {plan.status === 'failed' && <AlertTriangle />}
              {status.label}
            </Badge>
            <span className="text-2xs font-medium uppercase tracking-wider text-ink-faint">
              {TYPE_LABEL[plan.prep_type]}
            </span>
          </div>

          <h3 className="mt-3 line-clamp-2 pr-6 font-display text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent">
            {plan.title}
          </h3>

          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {daysLeft > 0
                ? `${daysLeft} days left · ${formatDate(plan.target_date, { year: 'numeric' })}`
                : `Target passed · ${formatDate(plan.target_date, { year: 'numeric' })}`}
            </span>
          </p>

          {/* Pushes the progress block to the bottom, so cards of differing
              title lengths still line their bars up across the grid. */}
          <div className="mt-auto pt-5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="tabular text-xs text-ink-muted">
                {plan.done_items} / {plan.total_items} items
              </span>
              <span className="tabular font-display text-lg font-semibold leading-none">
                {progress}
                <span className="text-xs text-ink-faint">%</span>
              </span>
            </div>

            <Progress
              value={progress}
              tone={progress === 100 ? 'success' : 'accent'}
              label={`${plan.title}: ${progress}% complete`}
            />

            {today && today.total > 0 && (
              <p
                className={cn(
                  'mt-2.5 flex items-center gap-1.5 text-xs font-medium',
                  todayDone ? 'text-success' : 'text-accent',
                )}
              >
                {todayDone ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Today complete
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {today.total - today.done} left today
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Affordance that the card leads somewhere. Fine-pointer only — on
            touch there is no hover to reveal it, and it would just be noise. */}
        <ArrowUpRight
          aria-hidden
          className="pointer-events-none absolute bottom-4 right-4 z-[1] hidden h-4 w-4 text-ink-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer:block"
        />

        <div className="absolute right-2.5 top-2.5 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Options for ${plan.title}`}
                className={cn(
                  'flex h-touch w-touch items-center justify-center rounded-field text-ink-faint',
                  'outline-none transition-colors hover:bg-surface-2 hover:text-ink',
                  'focus-visible:ring-2 focus-visible:ring-accent/60',
                  /*
                    Reveal-on-hover makes the control unreachable without a
                    mouse: a touch device never fires hover, so on a phone the
                    plan menu simply did not exist. It is always visible, and
                    only hidden until hover where a fine pointer is available.
                  */
                  'data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
                  'pointer:opacity-0 pointer:group-hover:opacity-100 pointer:focus-visible:opacity-100 pointer:data-[state=open]:opacity-100',
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              <DropdownMenuItem tone="danger" onSelect={() => setConfirming(true)}>
                <Trash2 />
                Delete plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this plan?"
        description={`"${plan.title}" and everything in it — schedule, resources, drill history and coach conversation — will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete permanently"
        onConfirm={remove}
        loading={deleting}
        destructive
      />
    </>
  );
}
