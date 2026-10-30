'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { rpc } from '@/lib/api';
import CoupuresPanel from './CoupuresPanel';
import { groupBy, heure, jourCourt, jourLong, parisToday } from '@/lib/format';

const DUREES = [15, 20, 30, 45, 60, 90, 120];

function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

export default function SlotsPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, notify } = ctx;
  const [jours, setJours] = useState<string[]>([]);
  const [d1, setD1] = useState('');
  const [rDe, setRDe] = useState('');
  const [rA, setRA] = useState('');
  const [weekend, setWeekend] = useState(false);
  const [debut, setDebut] = useState('09:00');
  const [fin, setFin] = useState('12:00');
  const [duree, setDuree] = useState(30);
  const [capa, setCapa] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const addJour = (j: string) => j && setJours((x) => (x.includes(j) ? x : [...x, j].sort()));
  function addPlage() {
    if (!rDe || !rA || rA < rDe) return;
    const out: string[] = [];
    const d = new Date(`${rDe}T12:00:00Z`), end = new Date(`${rA}T12:00:00Z`);
    while (d <= end && out.length < 120) {
      const wd = d.getUTCDay();
      if (weekend || (wd !== 0 && wd !== 6)) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    setJours((x) => Array.from(new Set([...x, ...out])).sort());
  }

  const parJourCount = debut && fin && toMin(fin) > toMin(debut) ? Math.floor((toMin(fin) - toMin(debut)) / duree) : 0;
  const totalPrev = parJourCount * jours.length;

  async function generer() {
    let n = 0;
    const ok = await act(async () => {
      n = await rpc<number>('admin_generate_creneaux', {
        p_token: token, p_op: opId, p_jours: jours, p_debut: debut, p_fin: fin, p_duree: duree, p_capacite: capa,
      });
    });
    if (ok) {
      setJours([]);
      notify(n === totalPrev ? `${n} créneau${n > 1 ? 'x' : ''} créé${n > 1 ? 's' : ''}` : `${n} créneau(x) créé(s) — ${totalPrev - n} existai(en)t déjà`);
    }
  }

  const today = parisToday();
  const parJour = groupBy(data.creneaux, (c) => c.jour);
  const existants = Array.from(parJour.keys()).sort();

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const supprimer = (ids: string[]) =>
    ids.length && confirm(`Supprimer ${ids.length} créneau${ids.length > 1 ? 'x' : ''} ?`) &&
    act(() => rpc('admin_delete_creneaux', { p_token: token, p_op: opId, p_ids: ids }), 'Créneaux supprimés').then(() => setSel(new Set()));

  const batNom = (id?: string | null) => (id ? data.batiments.find((b) => b.id === id)?.nom ?? '' : '');

  return (
    <>
      <CoupuresPanel ctx={ctx} />
      <div className="card">
        <h2>Ouvrir des créneaux</h2>
        <p className="hint">Choisissez les jours, puis la plage horaire et la durée de chaque visite. Les créneaux seront découpés automatiquement.</p>

        <div className="row">
          <div className="field">
            <label>Ajouter un jour</label>
            <div className="flex" style={{ flexWrap: 'nowrap' }}>
              <input type="date" value={d1} min={today} onChange={(e) => setD1(e.target.value)} />
              <button className="btn ghost" type="button" onClick={() => { addJour(d1); setD1(''); }} disabled={!d1}>Ajouter</button>
            </div>
          </div>
          <div className="field">
            <label>…ou une période</label>
            <div className="flex" style={{ flexWrap: 'nowrap' }}>
              <input type="date" value={rDe} min={today} onChange={(e) => setRDe(e.target.value)} aria-label="Du" />
              <input type="date" value={rA} min={rDe || today} onChange={(e) => setRA(e.target.value)} aria-label="Au" />
              <button className="btn ghost" type="button" onClick={addPlage} disabled={!rDe || !rA}>Ajouter</button>
            </div>
            <label className="flex small" style={{ gap: 6, marginTop: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} /> inclure samedis et dimanches
            </label>
          </div>
        </div>

        {jours.length > 0 && (
          <div className="field">
            <div className="chips">
              {jours.map((j) => (
                <span className="chip" key={j}>{jourCourt(j)}<button type="button" onClick={() => setJours((x) => x.filter((y) => y !== j))} aria-label="Retirer">×</button></span>
              ))}
              <button className="linkbtn small" onClick={() => setJours([])}>Tout retirer</button>
            </div>
          </div>
        )}

        <div className="row4 keep2">
          <div className="field"><label>De</label><input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} step={300} /></div>
          <div className="field"><label>À</label><input type="time" value={fin} onChange={(e) => setFin(e.target.value)} step={300} /></div>
          <div className="field">
            <label>Durée d’une visite</label>
            <select value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
              {DUREES.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${Math.floor(d / 60)}h${d % 60 ? String(d % 60).padStart(2, '0') : ''}`}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Logements par créneau</label>
            <input type="number" min={1} max={20} value={capa} onChange={(e) => setCapa(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>
        <div className="flex">
          <button className="btn" disabled={totalPrev === 0} onClick={generer}>
            Créer {totalPrev > 0 ? `${totalPrev} créneau${totalPrev > 1 ? 'x' : ''}` : 'les créneaux'}
          </button>
          {jours.length === 0 && <span className="muted small">Ajoutez au moins un jour.</span>}
          {jours.length > 0 && parJourCount === 0 && <span className="muted small">Vérifiez les horaires.</span>}
          {totalPrev > 0 && <span className="muted small">{parJourCount} par jour × {jours.length} jour{jours.length > 1 ? 's' : ''}</span>}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Astuce : pour une pause déjeuner, créez la matinée puis l’après-midi en deux fois avec les mêmes jours.</p>
      </div>

      <div className="card">
        <div className="flex" style={{ marginBottom: 10 }}>
          <h2 className="grow" style={{ margin: 0 }}>Créneaux existants</h2>
          {sel.size > 0 && <button className="btn danger sm" onClick={() => supprimer(Array.from(sel))}>Supprimer la sélection ({sel.size})</button>}
        </div>
        {existants.length === 0 && <div className="notice info" style={{ margin: 0 }}>Aucun créneau pour l’instant.</div>}
        {existants.map((j) => {
          const cs = parJour.get(j)!;
          const libres = cs.filter((c) => c.pris === 0).map((c) => c.id);
          return (
            <div className="daygroup" key={j}>
              <h3>
                {jourLong(j)}
                {j < today && <span className="badge grey">passé</span>}
                <span className="grow" />
                {libres.length > 0 && (
                  <button className="linkbtn small" style={{ fontWeight: 400 }} onClick={() => supprimer(libres)}>
                    Supprimer les créneaux libres de ce jour
                  </button>
                )}
              </h3>
              <table className="list">
                <tbody>
                  {cs.map((c) => (
                    <tr key={c.id}>
                      <td style={{ width: 30 }}>
                        <input type="checkbox" disabled={c.pris > 0} checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label="Sélectionner" />
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {heure(c.debut)} – {heure(c.fin)}
                        {c.batiment_id && <span className="badge eau" style={{ marginLeft: 6 }}>💧 {batNom(c.batiment_id) || 'coupure'}</span>}
                      </td>
                      <td>
                        {c.pris >= c.capacite ? <span className="badge ok">Complet</span> : c.pris > 0 ? <span className="badge">{c.pris}/{c.capacite}</span> : <span className="badge grey">Libre</span>}
                      </td>
                      <td style={{ width: 150 }}>
                        <div className="flex" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <span className="small muted">Places</span>
                          <input type="number" min={Math.max(1, c.pris)} max={20} defaultValue={c.capacite} style={{ width: 70, padding: '6px 8px' }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v && v !== c.capacite) act(() => rpc('admin_update_creneau', { p_token: token, p_op: opId, p_id: c.id, p_capacite: v }), 'Capacité mise à jour');
                            }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}
