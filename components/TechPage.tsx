'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header, { Footer } from './Header';
import { Toast } from './ui';
import CoupuresBanner from './Coupures';
import { AppError, errMsg, rpc } from '@/lib/api';
import { ETAGES_POSSIBLES, etageLabel, groupBy, heure, jourCourt, jourLong, lotLabel, mapsUrl, opSub, opTitle, parisToday, sortLots } from '@/lib/format';
import type { Batiment, Creneau, Lot, OpData, Reservation, Visite } from '@/lib/types';

function VisiteCard({ lot, batiments, resa, creneau, onSet, onDelete }: {
  lot: Lot; batiments: Batiment[]; resa?: Reservation; creneau?: Creneau;
  onSet: (lot: Lot, statut: Visite, note: string) => Promise<void>;
  onDelete?: (lot: Lot) => void;
}) {
  const [note, setNote] = useState(lot.visite_note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(lot.visite_note ?? ''), [lot.visite_note]);

  const set = async (statut: Visite) => {
    setBusy(true);
    await onSet(lot, statut, note);
    setBusy(false);
  };

  return (
    <div className={`techcard ${lot.visite ?? ''}`}>
      <div className="h">
        <span className="lot">{lotLabel(lot, batiments)}{(lot.absences ?? 0) > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{(lot.absences ?? 0) + 1}e passage</span>}</span>
        {creneau && <span className="t">{heure(creneau.debut)}</span>}
      </div>
      {resa ? (
        <div>
          <div style={{ fontWeight: 600 }}>{resa.nom}</div>
          <a className="tel" href={`tel:${resa.telephone.replace(/\s/g, '')}`}>📞 {resa.telephone}</a>
          {resa.commentaire && <div className="small" style={{ fontStyle: 'italic', marginTop: 4 }}>« {resa.commentaire} »</div>}
        </div>
      ) : (
        <div className="flex small muted" style={{ justifyContent: 'space-between' }}>
          <span>
            Pas de rendez-vous
            {lot.occupant_nom && <> · {lot.occupant_nom}</>}
            {lot.occupant_tel && <> · <a href={`tel:${lot.occupant_tel.replace(/[^\d+]/g, '')}`}>{lot.occupant_tel}</a></>}
          </span>
          {onDelete && <button className="linkbtn small" style={{ color: 'var(--err)' }} onClick={() => onDelete(lot)}>Supprimer ce logement</button>}
        </div>
      )}
      <div className="vbtns">
        <button className={`vbtn vu ${lot.visite === 'vu' ? 'on' : ''}`} disabled={busy}
          onClick={() => set(lot.visite === 'vu' ? null : 'vu')}>✓ Visité</button>
        <button className={`vbtn absent ${lot.visite === 'absent' ? 'on' : ''}`} disabled={busy}
          onClick={() => set(lot.visite === 'absent' ? null : 'absent')}>✗ Absent</button>
      </div>
      {lot.visite && (
        <textarea placeholder="Note (facultatif) : fuite sous évier, à revoir, clé chez le gardien…" value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (lot.visite_note ?? '')) set(lot.visite ?? null); }} />
      )}
    </div>
  );
}

export default function TechPage({ token }: { token: string }) {
  const [data, setData] = useState<OpData | null>(null);
  const [err, setErr] = useState('');
  const [vue, setVue] = useState<'rdv' | 'lots'>('rdv');
  const [jour, setJour] = useState('');
  const [filtre, setFiltre] = useState<'avoir' | 'tous'>('avoir');
  const [toast, setToast] = useState('');
  const [ajout, setAjout] = useState(false);
  const [aBat, setABat] = useState('');
  const [aEtage, setAEtage] = useState('0');
  const [aNum, setANum] = useState('');

  const load = useCallback(async () => {
    try { setData(await rpc<OpData>('tech_operation', { p_token: token })); setErr(''); }
    catch (e) {
      setErr(errMsg(e));
      if (e instanceof AppError && e.code === 'ACCES_REFUSE') setData(null);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const f = () => load();
    window.addEventListener('focus', f);
    return () => { clearInterval(t); window.removeEventListener('focus', f); };
  }, [load]);

  const cMap = useMemo(() => new Map((data?.creneaux ?? []).map((c) => [c.id, c])), [data]);
  const resaByLot = useMemo(() => new Map((data?.reservations ?? []).map((r) => [r.lot_id, r])), [data]);
  const joursRdv = useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.reservations ?? []) { const c = cMap.get(r.creneau_id); if (c) s.add(c.jour); }
    return Array.from(s).sort();
  }, [data, cMap]);

  // Jour par défaut : aujourd'hui s'il y a des RDV, sinon le prochain, sinon le dernier
  useEffect(() => {
    if (jour || joursRdv.length === 0) return;
    const today = parisToday();
    setJour(joursRdv.find((j) => j >= today) ?? joursRdv[joursRdv.length - 1]);
  }, [joursRdv, jour]);

  async function setVisite(lot: Lot, statut: Visite, note: string) {
    setData((d) => d && { ...d, lots: d.lots.map((l) => (l.id === lot.id ? { ...l, visite: statut, visite_note: statut ? note || null : null } : l)) });
    try {
      await rpc('tech_set_visite', { p_token: token, p_lot: lot.id, p_statut: statut, p_note: statut ? note : null });
      setToast(statut === 'vu' ? 'Marqué visité ✓' : statut === 'absent' ? 'Marqué absent' : 'Remis à faire');
      setTimeout(() => setToast(''), 1800);
    } catch (e) {
      alert(errMsg(e));
      load();
    }
  }

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1800); };

  async function ajouterLot() {
    const bat = aBat || data?.batiments[0]?.id;
    if (!bat || !aNum.trim()) return;
    try {
      await rpc('tech_add_lot', { p_token: token, p_batiment: bat, p_etage: parseInt(aEtage, 10), p_numero: aNum.trim() });
      setANum('');
      setAjout(false);
      setFiltre('tous');
      await load();
      flash('Logement ajouté');
    } catch (e) { alert(errMsg(e)); }
  }

  async function supprimerLot(l: Lot) {
    if (!confirm(`Supprimer le lot ${l.numero} (${etageLabel(l.etage)}) ? À utiliser seulement si ce logement n’existe pas.`)) return;
    try {
      await rpc('tech_delete_lot', { p_token: token, p_lot: l.id });
      await load();
      flash('Logement supprimé');
    } catch (e) { alert(errMsg(e)); }
  }

  if (!data) {
    return (
      <>
        <Header kicker="Espace technicien" />
        <div className="wrap narrow">
          {err ? <div className="card" style={{ marginTop: 24 }}><div className="notice err" style={{ margin: 0 }}>{err}</div></div> : <div className="loading">Chargement…</div>}
        </div>
      </>
    );
  }

  const op = data.operation;
  const lotsById = new Map(data.lots.map((l) => [l.id, l]));
  const nbVus = data.lots.filter((l) => l.visite === 'vu').length;
  const nbAbs = data.lots.filter((l) => l.visite === 'absent').length;
  const total = data.lots.length;

  const rdvDuJour = data.reservations
    .map((r) => ({ r, c: cMap.get(r.creneau_id), l: lotsById.get(r.lot_id) }))
    .filter((x): x is { r: Reservation; c: Creneau; l: Lot } => !!x.c && !!x.l && x.c.jour === jour)
    .sort((a, b) => a.c.debut.localeCompare(b.c.debut));

  let lots = sortLots(data.lots, data.batiments);
  if (filtre === 'avoir') lots = lots.filter((l) => l.visite !== 'vu');
  const parBat = groupBy(lots, (l) => l.batiment_id);

  return (
    <>
      <Header kicker="Espace technicien" title={opTitle(op)} partenaire={op.bailleur} />
      <main>
        <div className="wrap narrow">
          <div className="card" style={{ padding: 16 }}>
            <div className="flex">
              <span className="badge">{op.objet}</span>
              {op.adresse && <a className="maplink" href={mapsUrl(op.adresse)} target="_blank" rel="noreferrer">{opSub(op) ?? op.adresse} ↗</a>}
            </div>
            {total > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="flex small" style={{ justifyContent: 'space-between' }}>
                  <b>{nbVus} / {total} visités</b>
                  {nbAbs > 0 && <span className="badge absent">{nbAbs} absent{nbAbs > 1 ? 's' : ''}</span>}
                </div>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${(100 * nbVus) / total}%`, background: 'var(--ok)' }} /></div>
              </div>
            )}
            {op.consignes && <div className="notice warn consignes" style={{ marginTop: 12, marginBottom: 0 }}>{op.consignes}</div>}
            {(data.coupures ?? []).length > 0 && <div style={{ marginTop: 12 }}><CoupuresBanner coupures={data.coupures!} batiments={data.batiments} compact /></div>}
          </div>

          <div className="seg" style={{ marginBottom: 14 }}>
            <button className={vue === 'rdv' ? 'on' : ''} onClick={() => setVue('rdv')}>Rendez-vous</button>
            <button className={vue === 'lots' ? 'on' : ''} onClick={() => setVue('lots')}>Tous les logements</button>
          </div>

          {vue === 'rdv' && (
            <>
              {joursRdv.length === 0 ? (
                <div className="notice info">Aucun rendez-vous pour l’instant. Les logements sans rendez-vous sont dans « Tous les logements ».</div>
              ) : (
                <>
                  <div className="days" style={{ marginBottom: 12 }}>
                    {joursRdv.map((j) => {
                      const n = data.reservations.filter((r) => cMap.get(r.creneau_id)?.jour === j).length;
                      return (
                        <button key={j} className={`day ${jour === j ? 'on' : ''}`} onClick={() => setJour(j)}>
                          <div className="d">{j === parisToday() ? 'Aujourd’hui' : jourCourt(j)}</div>
                          <div className="n">{n} RDV</div>
                        </button>
                      );
                    })}
                  </div>
                  {jour && <div className="lbl">{jourLong(jour)}</div>}
                  {rdvDuJour.map(({ r, c, l }) => (
                    <VisiteCard key={r.id} lot={l} batiments={data.batiments} resa={r} creneau={c} onSet={setVisite} />
                  ))}
                </>
              )}
            </>
          )}

          {vue === 'lots' && (
            <>
              <div className="seg" style={{ marginBottom: 12 }}>
                <button className={filtre === 'avoir' ? 'on' : ''} onClick={() => setFiltre('avoir')}>Restant à voir</button>
                <button className={filtre === 'tous' ? 'on' : ''} onClick={() => setFiltre('tous')}>Tous</button>
              </div>
              {!ajout ? (
                <button className="btn ghost" style={{ width: '100%', marginBottom: 12 }} onClick={() => setAjout(true)}>+ Ajouter un logement manquant</button>
              ) : (
                <div className="card" style={{ padding: 14 }}>
                  <h3>Ajouter un logement</h3>
                  {data.batiments.length > 1 && (
                    <div className="field">
                      <label>Bâtiment</label>
                      <select value={aBat || data.batiments[0].id} onChange={(e) => setABat(e.target.value)}>
                        {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="row">
                    <div className="field">
                      <label>Étage</label>
                      <select value={aEtage} onChange={(e) => setAEtage(e.target.value)}>
                        {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Numéro</label>
                      <input type="text" value={aNum} onChange={(e) => setANum(e.target.value)} placeholder="ex. 104, B, Loge" />
                    </div>
                  </div>
                  <div className="btns">
                    <button className="btn" disabled={!aNum.trim()} onClick={ajouterLot}>Ajouter</button>
                    <button className="btn ghost" onClick={() => setAjout(false)}>Annuler</button>
                  </div>
                </div>
              )}
              {total === 0 && <div className="notice info">La liste des logements n’a pas été saisie.</div>}
              {total > 0 && lots.length === 0 && <div className="notice ok">Tous les logements ont été visités 🎉</div>}
              {data.batiments.filter((b) => parBat.has(b.id)).map((b) => {
                const parEtage = groupBy(parBat.get(b.id)!, (l) => String(l.etage));
                const ets = Array.from(parEtage.keys()).map(Number).sort((x, y) => x - y);
                return (
                  <div key={b.id}>
                    {data.batiments.length > 1 && <h3 style={{ color: 'var(--navy)', margin: '14px 0 6px' }}>{b.nom}</h3>}
                    {ets.map((e) => (
                      <div key={e}>
                        <div className="lbl muted" style={{ marginTop: 8 }}>{etageLabel(e)}</div>
                        {parEtage.get(String(e))!.map((l) => {
                          const r = resaByLot.get(l.id);
                          return <VisiteCard key={l.id} lot={l} batiments={data.batiments} resa={r} creneau={r ? cMap.get(r.creneau_id) : undefined} onSet={setVisite} onDelete={r ? undefined : supprimerLot} />;
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>
      <Footer />
      <Toast msg={toast} />
    </>
  );
}
