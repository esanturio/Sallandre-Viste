'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { coupureCible } from './Coupures';
import { rpc } from '@/lib/api';
import { heure, jourLong, parisToday } from '@/lib/format';

const DUREES = [15, 20, 30, 45, 60, 90, 120];
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function CoupuresPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, notify } = ctx;
  const multi = data.batiments.length > 1;
  const [bat, setBat] = useState<string>(multi ? data.batiments[0].id : '');
  const [jour, setJour] = useState('');
  const [debut, setDebut] = useState('09:00');
  const [fin, setFin] = useState('12:00');
  const [ouvrir, setOuvrir] = useState(true);
  const [duree, setDuree] = useState(30);
  const [capa, setCapa] = useState(1);

  const coupures = data.coupures ?? [];
  const nbCreneaux = fin > debut ? Math.floor((toMin(fin) - toMin(debut)) / duree) : 0;
  const valide = !!jour && fin > debut;

  async function ajouter() {
    let n = 0;
    const ok = await act(async () => {
      await rpc('admin_save_coupure', { p_token: token, p_op: opId, p_batiment: bat || null, p_jour: jour, p_debut: debut, p_fin: fin });
      if (ouvrir && nbCreneaux > 0) {
        n = await rpc<number>('admin_generate_creneaux', {
          p_token: token, p_op: opId, p_jours: [jour], p_debut: debut, p_fin: fin, p_duree: duree, p_capacite: capa, p_batiment: bat || null,
        });
      }
    });
    if (ok) {
      notify(ouvrir && n > 0 ? `Coupure ajoutée · ${n} créneau${n > 1 ? 'x' : ''} de visite ouvert${n > 1 ? 's' : ''}` : 'Coupure ajoutée');
      setJour('');
    }
  }

  return (
    <div className="card">
      <h2>💧 Coupures d’eau</h2>
      <p className="hint">
        Les coupures sont affichées aux occupants (page de réservation, écran de confirmation, affiche), au gardien et au technicien.
        Vous pouvez ouvrir en même temps les créneaux de visite pendant la coupure{multi ? ' : ils seront réservés aux logements du bâtiment coupé' : ''}.
      </p>

      <div className={multi ? 'row4' : 'row3'}>
        {multi && (
          <div className="field">
            <label>Concerne</label>
            <select value={bat} onChange={(e) => setBat(e.target.value)}>
              {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              <option value="">Tout l’immeuble</option>
            </select>
          </div>
        )}
        <div className="field"><label>Date</label><input type="date" value={jour} min={parisToday()} onChange={(e) => setJour(e.target.value)} /></div>
        <div className="field"><label>De</label><input type="time" value={debut} step={300} onChange={(e) => setDebut(e.target.value)} /></div>
        <div className="field"><label>À</label><input type="time" value={fin} step={300} onChange={(e) => setFin(e.target.value)} /></div>
      </div>

      <label className="flex small" style={{ gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={ouvrir} onChange={(e) => setOuvrir(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>Ouvrir les créneaux de visite pendant la coupure</span>
      </label>
      {ouvrir && (
        <div className="row3" style={{ maxWidth: 520 }}>
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
          <div className="field" style={{ alignSelf: 'end' }}>
            <span className="muted small">{nbCreneaux > 0 ? `${nbCreneaux} créneau${nbCreneaux > 1 ? 'x' : ''}` : ''}</span>
          </div>
        </div>
      )}
      <button className="btn" disabled={!valide} onClick={ajouter}>Ajouter la coupure</button>

      {coupures.length > 0 && (
        <table className="list" style={{ marginTop: 16 }}>
          <tbody>
            {coupures.map((k) => {
              const lies = data.creneaux.filter((c) => c.jour === k.jour && (c.batiment_id ?? null) === (k.batiment_id ?? null) && c.debut >= k.debut && c.fin <= k.fin);
              const pris = lies.reduce((t, c) => t + c.pris, 0);
              return (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{jourLong(k.jour)}{k.jour < parisToday() && <span className="badge grey" style={{ marginLeft: 6 }}>passée</span>}</td>
                  <td>{heure(k.debut)} – {heure(k.fin)}</td>
                  <td>{coupureCible(k, data.batiments) || '—'}</td>
                  <td className="muted small">{lies.length ? `${lies.length} créneaux · ${pris} RDV` : 'pas de créneau lié'}</td>
                  <td style={{ width: 1 }}>
                    <button className="btn danger sm" onClick={() => confirm('Supprimer cette coupure ? (Les créneaux de visite déjà ouverts restent en place.)') &&
                      act(() => rpc('admin_delete_coupure', { p_token: token, p_op: opId, p_id: k.id }), 'Coupure supprimée')}>Supprimer</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
