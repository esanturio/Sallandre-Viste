'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Header, { Footer } from './Header';
import { errMsg, rpc } from '@/lib/api';
import { jourCourt } from '@/lib/format';
import type { OpSummary } from '@/lib/types';

export default function AdminHome({ token }: { token: string }) {
  const router = useRouter();
  const [ops, setOps] = useState<OpSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [showArch, setShowArch] = useState(false);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ immeuble: '', adresse: '', objet: 'Visite technique', consignes: '', multi: false, bats: 'Bâtiment A\nBâtiment B' });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    try { setOps(await rpc<OpSummary[]>('admin_operations', { p_token: token })); setErr(''); }
    catch (e) { setErr(errMsg(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
    if (!f.immeuble.trim()) { setFormErr('Merci d’indiquer le nom de l’immeuble.'); return; }
    setBusy(true);
    try {
      const id = await rpc<string>('admin_save_operation', {
        p_token: token, p_op: null, p_immeuble: f.immeuble, p_adresse: f.adresse, p_objet: f.objet, p_consignes: f.consignes, p_archived: false,
        p_batiments: f.multi ? f.bats.split('\n').map((s) => s.trim()).filter(Boolean) : null,
      });
      router.push(`/admin/${token}/${id}`);
    } catch (ex) {
      setFormErr(errMsg(ex));
      setBusy(false);
    }
  }

  if (err && !ops) {
    return (
      <>
        <Header kicker="Administration" />
        <div className="wrap narrow"><div className="card" style={{ marginTop: 24 }}><div className="notice err" style={{ margin: 0 }}>{err}</div></div></div>
      </>
    );
  }

  const visibles = (ops ?? []).filter((o) => showArch || !o.archived);
  const nbArch = (ops ?? []).filter((o) => o.archived).length;

  return (
    <>
      <Header kicker="Administration" title="Mes opérations" right={<button className="btn sm" onClick={() => setCreating(true)}>+ Nouvelle opération</button>} />
      <main>
        <div className="wrap">
          {creating && (
            <form className="card" onSubmit={create}>
              <h2>Nouvelle opération</h2>
              <p className="hint">Un immeuble + l’objet de la visite. Vous ajouterez ensuite les dates, les créneaux et, si vous le souhaitez, la liste des logements.</p>
              <div className="row">
                <div className="field"><label>Nom de l’immeuble / résidence</label><input type="text" value={f.immeuble} onChange={(e) => setF({ ...f, immeuble: e.target.value })} autoFocus /></div>
                <div className="field"><label>Objet de la visite</label><input type="text" value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} placeholder="ex. Audit plomberie, relevé compteurs…" /></div>
              </div>
              <div className="field"><label>Adresse</label><input type="text" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></div>
              <div className="field">
                <label>Consignes pour les occupants <span className="opt">(facultatif)</span></label>
                <textarea value={f.consignes} onChange={(e) => setF({ ...f, consignes: e.target.value })} placeholder="ex. Merci de dégager l’accès sous l’évier et à la salle de bains." />
              </div>
              <div className="field">
                <label>Bâtiments</label>
                <div className="seg">
                  <button type="button" className={!f.multi ? 'on' : ''} onClick={() => setF({ ...f, multi: false })}>Un seul bâtiment</button>
                  <button type="button" className={f.multi ? 'on' : ''} onClick={() => setF({ ...f, multi: true })}>Plusieurs bâtiments</button>
                </div>
              </div>
              {f.multi && (
                <div className="field">
                  <label>Noms des bâtiments <span className="opt">(un par ligne)</span></label>
                  <textarea value={f.bats} onChange={(e) => setF({ ...f, bats: e.target.value })} />
                </div>
              )}
              {formErr && <div className="notice err">{formErr}</div>}
              <div className="btns">
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer l’opération'}</button>
                <button className="btn ghost" type="button" onClick={() => setCreating(false)}>Annuler</button>
              </div>
            </form>
          )}

          {!ops && <div className="loading">Chargement…</div>}
          {ops && ops.length === 0 && !creating && (
            <div className="card center">
              <h2>Bienvenue</h2>
              <p className="muted">Créez votre première opération pour commencer à planifier des visites.</p>
              <button className="btn" onClick={() => setCreating(true)}>+ Nouvelle opération</button>
            </div>
          )}

          {visibles.map((o) => {
            const pct = o.nb_lots ? Math.min(100, Math.round((100 * o.nb_reservations) / o.nb_lots)) : 0;
            return (
              <Link key={o.id} href={`/admin/${token}/${o.id}`} className="card opcard">
                <div className="h">
                  <div>
                    <div className="name">{o.immeuble}</div>
                    {o.adresse && <div className="addr">{o.adresse}</div>}
                  </div>
                  <div className="flex" style={{ gap: 6 }}>
                    {o.archived && <span className="badge grey">Archivée</span>}
                    <span className="badge">{o.objet}</span>
                  </div>
                </div>
                <div className="nums">
                  <span><b>{o.nb_reservations}</b> rendez-vous</span>
                  {o.nb_lots > 0 && <span><b>{Math.max(0, o.nb_lots - o.nb_reservations)}</b> en attente sur {o.nb_lots} lots</span>}
                  <span><b>{o.nb_creneaux}</b> créneaux</span>
                  {o.premier_jour && (
                    <span>{o.premier_jour === o.dernier_jour ? jourCourt(o.premier_jour) : `du ${jourCourt(o.premier_jour)} au ${jourCourt(o.dernier_jour!)}`}</span>
                  )}
                </div>
                {o.nb_lots > 0 && <div className="progress"><div style={{ width: `${pct}%` }} /></div>}
              </Link>
            );
          })}

          {nbArch > 0 && (
            <button className="linkbtn small" onClick={() => setShowArch(!showArch)}>
              {showArch ? 'Masquer les opérations archivées' : `Afficher les opérations archivées (${nbArch})`}
            </button>
          )}

          <div className="notice info" style={{ marginTop: 24 }}>
            Gardez ce lien pour vous : c’est votre accès administrateur. Ajoutez cette page à vos favoris.
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
