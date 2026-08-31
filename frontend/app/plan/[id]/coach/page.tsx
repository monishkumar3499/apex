import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { todayIso } from '../../../../../backend/planner/calendar';
import { CoachChat, type ChatMessage } from '../../../../components/coach-chat';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function CoachPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/coach`);

  const db = admin();

  const { data: chat } = await db
    .from('chats')
    .select('id')
    .eq('plan_id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: messages } = chat
    ? await db
        .from('messages')
        .select('id, role, content, created_at')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true })
        .limit(100)
    : { data: [] };

  // Seed the suggestion chips from what the learner is actually doing today.
  const { data: session } = await db
    .from('sessions')
    .select('headline, session_items(title, kind, status)')
    .eq('plan_id', id)
    .eq('scheduled_on', todayIso())
    .maybeSingle();

  const pending = ((session?.session_items ?? []) as Array<{ title: string; kind: string; status: string }>)
    .filter((i) => i.status === 'pending' && i.kind === 'learn')
    .slice(0, 2)
    .map((i) => `Explain ${i.title} in plain terms`);

  const suggestions = [
    ...pending,
    'Am I on track to finish in time?',
    'What am I weakest at right now?',
  ].slice(0, 4);

  return (
    <CoachChat
      planId={id}
      initialMessages={(messages ?? []) as ChatMessage[]}
      suggestions={suggestions}
    />
  );
}
