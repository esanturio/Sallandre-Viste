// Tâche planifiée Vercel (voir vercel.json) : une fois par semaine, crée une fausse entrée
// dans la base puis la supprime aussitôt, pour garder le projet actif. Le passage est journalisé (table keepalive_log).
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xjspshcmgpllaebtmmmm.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_WJCeSrXk7QGtAYNJ4mVS7w_-HbnkuP2';

export async function GET(req: Request) {
  const cron = process.env.CRON_SECRET;
  if (!cron || req.headers.get('authorization') !== `Bearer ${cron}`) {
    return new Response('Non autorisé', { status: 401 });
  }
  const secret = process.env.KEEPALIVE_SECRET;
  if (!secret) return Response.json({ ok: false, erreur: 'KEEPALIVE_SECRET manquant' }, { status: 500 });

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: secret }),
    cache: 'no-store',
  });
  const body = await r.json().catch(() => null);
  return Response.json({ ok: r.ok, resultat: body }, { status: r.ok ? 200 : 502 });
}
