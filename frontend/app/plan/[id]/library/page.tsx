import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { LibraryView, type LibraryResource } from '../../../../components/library-view';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function LibraryPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/library`);

  const db = admin();

  const [{ data: resources }, { data: links }, { data: topics }] = await Promise.all([
    db
      .from('resources')
      .select('id, kind, title, url, source, author, description, thumbnail_url, duration_sec, metrics, score, why')
      .eq('plan_id', id)
      .eq('user_id', user.id)
      .order('score', { ascending: false }),
    db.from('topic_resources').select('topic_id, resource_id, rank').eq('plan_id', id),
    db.from('topics').select('id, title, idx').eq('plan_id', id).order('idx'),
  ]);

  const topicTitle = new Map((topics ?? []).map((t: any) => [t.id, t.title]));
  const topicsFor = new Map<string, string[]>();
  for (const link of (links ?? []) as Array<{ topic_id: string; resource_id: string }>) {
    const title = topicTitle.get(link.topic_id);
    if (!title) continue;
    topicsFor.set(link.resource_id, [...(topicsFor.get(link.resource_id) ?? []), title]);
  }

  const list: LibraryResource[] = (resources ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    url: r.url,
    author: r.author,
    description: r.description,
    thumbnail_url: r.thumbnail_url,
    duration_sec: r.duration_sec,
    why: r.why,
    score: Number(r.score),
    views: Number(r.metrics?.views ?? 0),
    topics: topicsFor.get(r.id) ?? [],
  }));

  return <LibraryView resources={list} />;
}
