/**
 * The APEX component layer.
 *
 * shadcn/ui conventions — Radix primitives, `cva` variants, `cn` merging, and
 * components owned in-repo rather than imported from a package — wired to
 * APEX's own semantic tokens (`bg-surface`, `text-ink`, `bg-accent`) instead
 * of shadcn's default `background`/`foreground` names.
 *
 * That substitution is deliberate. shadcn's palette reserves `accent` for
 * hover backgrounds, while APEX has used `accent` to mean "the amber that
 * carries every interactive state" since the design system was written. Taking
 * shadcn's naming would have silently redefined a token used in forty files.
 * The architecture is shadcn's; the vocabulary stays APEX's.
 */

export { Button, buttonVariants, type ButtonProps } from './button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Progress, Dial } from './progress';
export { Input, Textarea, Label, FormField } from './field';
export { Skeleton, SkeletonList, EmptyState, Callout, Separator, Avatar } from './feedback';
export { Stat, CountUp } from './stat';
export { PageHeader, SectionHeader } from './page-header';
export { Segmented, SegmentedMulti, SegmentedTabs, type SegmentedOption } from './segmented';
export { Spine, SpineNode } from './spine';
export { Slider } from './slider';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog';
export { ConfirmDialog } from './confirm-dialog';

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './sheet';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
} from './dropdown-menu';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint } from './tooltip';
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

export {
  MotionProvider,
  FadeIn,
  Stagger,
  StaggerChild,
  Collapsible,
  staggerContainer,
  staggerItem,
  EASE,
} from './motion';
