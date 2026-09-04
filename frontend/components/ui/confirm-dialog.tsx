'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { Button } from './button';

/**
 * "Are you sure?" in one component.
 *
 * Destructive confirmations are where a hand-rolled dialog is most dangerous:
 * the delete button is the thing focus lands on, so without a focus trap a
 * stray Enter can destroy a plan the learner spent months on. This is built on
 * the Radix Dialog, which puts initial focus on the *cancel* action and traps
 * it inside the panel.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  loading,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Focus the safe option, not the destructive one.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        // A half-finished delete should not be dismissable by a stray click,
        // but Escape still works — the keyboard user is being deliberate.
        onPointerDownOutside={(event) => loading && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter>
          <Button ref={cancelRef} variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
