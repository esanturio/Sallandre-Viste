'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Header, { Footer } from './Header';
import AddressInput from './AddressInput';
import BatimentGen, { defaultSpec, genTotal, type GenSpec } from './BatimentGen';
import { errMsg, rpc } from '@/lib/api';
import { jourCourt, opSub, opTitle } from '@/lib/format';
import type { OpSummary } from '@/lib/types';

export default function AdminHome({ token }: { token: string }) {
  const router = useRouter();
  const [ops, setOps] = useState<OpSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [showArch, setShowArch] = useState(false);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ adresse: '', immeuble: '', objet: 'Visite technique', consignes: '' });
  const [structure, setStructure] = useState<'plus_tard' | 'maintenant'>('maintenant');
  const [bats, setBats] = useState<GenSpec[]>([defaultSpec()]);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    try { setOps(await rpc<OpSummary[]>('admin_operations', { p_token: token })); setErr(''); }
    catch (e) { setErr(errMsg(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const totalLots = bats.reduce((s, b) => s + genTotal(b), 0);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
    if (!f.adresse.trim()) { setFormErr('Merci d’indiquer l’adresse de l’immeuble.'); return; }
    if (structure === 'maintenant' && bats.length > 1 && bats.some((b) => !b.nom.trim())) {
      setFormErr('Merci de nommer chaque bâtiment (ex. Bâtiment A, Bâtiment B).');
      return;
    }
    setBusy(true);
    try {
      const id = await rpc<string>('admin_save_operation', {
        p_token: token, p_op: null, p_immeuble: f.immeuble, p_adresse: f.adresse, p_objet: f.objet, p_consignes: f.consignes, p_archived: false, p_batiments: null,
      });
      if (structure === 'maintenant') {
        for (const b of bats) {
          await rpc('staff_generate_lots', {
            p_token: token, p_op: id, p_batiment: null, p_nom: b.nom.trim() || 'Bâtiment unique',
            p_etage_min: b.min, p_etage_max: b.max, p_par_etage: b.par, p_numerotation: b.num,
          });
        }
      }
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
              <p className="hint">L’adresse identifie l’immeuble. Vous ajouterez ensuite les dates et les créneaux.</p>

              <div className="field">
                <label htmlFor="adresse">Adresse de l’immeuble</label>
                <AddressInput id="adresse" value={f.adresse} onChange={(v) => setF({ ...f, adresse: v })} autoFocus />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="nom">Nom de la résidence <span className="opt">(facultatif)</span></label>
                  <input id="nom" type="text" value={f.immeuble} onChange={(e) => setF({ ...f, immeuble: e.target.value })} placeholder="ex. Résidence Les Tilleuls" />
                </div>
                <div className="field">
                  <label htmlFor="objet">Objet de la visite</label>
                  <input id="objet" type="text" value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} placeholder="ex. Audit plomberie, relevé compteurs…" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="consignes">Consignes pour les occupants <span className="opt">(facultatif)</span></label>
                <textarea id="consignes" value={f.consignes} onChange={(e) => setF({ ...f, consignes: e.target.value })} placeholder="ex. Merci de dégager l’accès sous l’évier et à la salle de bains." />
              </div>

              <div className="field">
                <label>Bâtiments et logements</label>
                <div className="seg">
                  <button type="button" className={structure === 'maintenant' ? 'on' : ''} onClick={() => setStructure('maintenant')}>Je les décris maintenant</button>
                  <button type="button" className={structure === 'plus_tard' ? 'on' : ''} onClick={() => setStructure('plus_tard')}>Plus tard / par le gardien</button>
                </div>
              </div>
              {structure === 'maintenant' && (
                <>
                  <p className="hint">Indiquez les étages et le nombre de logements par étage : la liste est générée automatiquement. Vous pourrez ajuster lot par lot ensuite.</p>
                  {bats.map((b, i) => (
                    <BatimentGen key={i} spec={b} nomFacultatif={bats.length === 1}
                      onChange={(s) => setBats(bats.map((x, j) => (j === i ? s : x)))}
                      onRemove={bats.length > 1 ? () => setBats(bats.filter((_, j) => j !== i)) : undefined} />
                  ))}
                  <div className="flex" style={{ marginBottom: 14 }}>
                    <button type="button" className="btn ghost sm" onClick={() => {
                      const letters = 'ABCDEFGHIJ';
                      const named = bats.map((b, j) => (b.nom.trim() ? b : { ...b, nom: `Bâtiment ${letters[j] ?? j + 1}` }));
                      setBats([...named, defaultSpec(`Bâtiment ${letters[named.length] ?? named.length + 1}`)]);
                    }}>+ Ajouter un autre bâtiment</button>
                    {totalLots > 0 && <span className="muted small">{totalLots} logements au total</span>}
                  </div>
                </>
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
            const sub = opSub(o);
            return (
              <Link key={o.id} href={`/admin/${token}/${o.id}`} className="card opcard">
                <div className="h">
                  <div>
                    <div className="name">{opTitle(o)}</div>
                    {sub && <div className="addr">{sub}</div>}
                  </div>
                  <div className="flex" style={{ gap: 6 }}>
                    {o.archived && <span className="badge grey">Archivée</span>}
                    <span className="badge">{o.objet}</span>
                  </div>
                </div>
                <div className="nums">
                  <span><b>{o.nb_reservations}</b> rendez-vous</span>
                  {o.nb_lots > 0 && <span><b>{Math.max(0, o.nb_lots - o.nb_reservations)}</b> en attente sur {o.nb_lots} lots</span>}
                  {o.nb_vus > 0 && <span><b>{o.nb_vus}</b> visité{o.nb_vus > 1 ? 's' : ''}</span>}
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
