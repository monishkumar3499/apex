'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, Trash2, Loader2, AlertTriangle, CalendarClock } from 'lucide-react';
import { Card, Badge, Progress, Modal, Button } from './ui';
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

export function PlanCard({
  plan,
  today,
}: {
  plan: PlanSummary;
  today?: { done: number; total: number };
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const progress = pct(plan.done_items, plan.total_items);
  const status = STATUS[plan.status] ?? STATUS.draft;
  const daysLeft = Math.ceil(
    (new Date(`${plan.target_date}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );

  const href = plan.status === 'building' ? `/plan/${plan.id}/building` : `/plan/${plan.id}/today`;

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
      <Card className="group relative overflow-hidden transition-all duration-200 hover:border-accent/30 hover:shadow-sm">
        <Link href={href} className="block p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge tone={status.tone}>
                  {plan.status === 'building' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  {plan.status === 'failed' && <AlertTriangle className="h-2.5 w-2.5" />}
                  {status.label}
                </Badge>
                <span className="text-2xs font-medium uppercase tracking-wider text-ink-faint">
                  {plan.prep_type === 'exam' ? 'Exam' : plan.prep_type === 'hybrid' ? 'Cert + role' : 'Skill'}
                </span>
              </div>

              <h3 className="mt-3 truncate font-display text-base font-semibold">{plan.title}</h3>

              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                {daysLeft > 0
                  ? `${daysLeft} days left · ${formatDate(plan.target_date, { year: 'numeric' })}`
                  : `Target passed · ${formatDate(plan.target_date, { year: 'numeric' })}`}
              </p>
            </div>

            <span className="tabular shrink-0 font-display text-xl font-semibold text-ink">
              {progress}
              <span className="text-sm text-ink-faint">%</span>
            </span>
          </div>

          <Progress value={progress} className="mt-4" />

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="tabular text-ink-muted">
              {plan.done_items} / {plan.total_items} items
            </span>

            {today && today.total > 0 && (
              <span
                className={cn(
                  'font-medium',
                  today.done >= today.total ? 'text-success' : 'text-accent',
                )}
              >
                {today.done >= today.total
                  ? 'Today complete'
                  : `${today.total - today.done} left today`}
              </span>
            )}
          </div>
        </Link>

        <div className="absolute right-3 top-3">
          <button
            aria-label="Plan options"
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-all hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="surface-raised absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-lg animate-scale-in">
                <button
                  onClick={() => { setMenuOpen(false); setConfirming(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete plan
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this plan?"
        description={`"${plan.title}" and everything in it — schedule, resources, drill history and coach conversation — will be permanently removed. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={deleting}>Delete permanently</Button>
          </>
        }
      />
    </>
  );
}
