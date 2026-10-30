'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { Modal } from './ui';
import { rpc } from '@/lib/api';
import { CHAMPS, construireLignes, devinerColonnes, lireFichier, type LigneImport, type Mapping } from '@/lib/importOccupants';
import { ETAGES_POSSIBLES, etageLabel } from '@/lib/format';

/** Import de la liste des occupants fournie par le bailleur (Excel / CSV) */
export default function ImportCard({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, notify } = ctx;
  const [rows, setRows] = useState<string[][] | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [entete, setEntete] = useState(0);
  const [map, setMap] = useState<Mapping | null>(null);
  const [depuisNumero, setDepuisNumero] = useState(true);
  const [etageDefaut, setEtageDefaut] = useState(0);
  const [batDefaut, setBatDefaut] = useState(data.batiments[0]?.id ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function ouvrir(f?: File | null) {
    setErr('');
    if (!f) return;
    try {
      const r = await lireFichier(f);
      if (r.length < 2) throw new Error('Le fichier semble vide.');
      const g = devinerColonnes(r);
      setRows(r); setEntete(g.entete); setMap(g.mapping); setNomFichier(f.name);
    } catch (e) {
      setErr((e as Error).message || 'Fichier illisible.');
    }
  }

  const fermer = () => { setRows(null); setMap(null); setErr(''); };

  const lignes: LigneImport[] = rows && map && map.numero >= 0
    ? construireLignes(rows, entete, map, { etageDepuisNumero: depuisNumero, etageDefaut })
    : [];
  const valides = lignes.filter((l) => l.etage !== null);
  const sansEtage = lignes.length - valides.length;
  const colonnes = rows ? (rows[entete] ?? []).map((c, i) => (String(c).trim() || `Colonne ${i + 1}`)) : [];
  const nbCols = rows ? Math.max(...rows.slice(0, 50).map((r) => r.length)) : 0;
  const optionsCol = Array.from({ length: nbCols }, (_, i) => ({ i, label: colonnes[i] ?? `Colonne ${i + 1}` }));

  async function importer() {
    setBusy(true);
    let tot = { crees: 0, maj: 0, ignores: 0, batiments: 0 };
    const ok = await act(async () => {
      for (let i = 0; i < valides.length; i += 500) {
        const r = await rpc<typeof tot>('staff_import_lots', { p_token: token, p_op: opId, p_rows: valides.slice(i, i + 500), p_batiment_defaut: batDefaut || null });
        tot = { crees: tot.crees + r.crees, maj: tot.maj + r.maj, ignores: tot.ignores + r.ignores, batiments: tot.batiments + r.batiments };
      }
    });
    setBusy(false);
    if (ok) {
      fermer();
      notify(`Import terminé : ${tot.crees} logement(s) créé(s), ${tot.maj} mis à jour${tot.batiments ? `, ${tot.batiments} bâtiment(s) ajouté(s)` : ''}${tot.ignores ? `, ${tot.ignores} ligne(s) ignorée(s)` : ''}`);
    }
  }

  return (
    <div className="card no-print">
      <h2>Importer la liste des occupants</h2>
      <p className="hint">
        Fichier Excel (.xlsx) ou CSV fourni par le bailleur : les logements sont créés et les coordonnées connues sont enregistrées
        pour pouvoir relancer ceux qui n’ont pas pris rendez-vous. Les colonnes sont reconnues automatiquement (lot, étage, bâtiment, nom, téléphone, e-mail).
      </p>
      <label className="btn ghost" style={{ cursor: 'pointer' }}>
        📄 Choisir le fichier…
        <input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: 'none' }}
          onChange={(e) => { ouvrir(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {err && <div className="notice err" style={{ marginTop: 12, marginBottom: 0 }}>{err}</div>}

      {rows && map && (
        <Modal title={`Import — ${nomFichier}`} onClose={fermer} wide>
          <p className="hint">Vérifiez à quelle colonne correspond chaque information. Seul le lot est obligatoire.</p>
          <div className="field">
            <label>Ligne des titres de colonnes</label>
            <select value={entete} onChange={(e) => { const r = Number(e.target.value); setEntete(r); setMap(devinerColonnes(rows.slice(r)).mapping); }}>
              {rows.slice(0, 15).map((r, i) => <option key={i} value={i}>Ligne {i + 1} : {r.filter(Boolean).slice(0, 5).join(' · ').slice(0, 70)}</option>)}
            </select>
          </div>
          <div className="row3">
            {CHAMPS.map((c) => (
              <div className="field" key={c.k}>
                <label>{c.label}{c.requis ? '' : <span className="opt"> (facultatif)</span>}</label>
                <select value={map[c.k]} onChange={(e) => setMap({ ...map, [c.k]: Number(e.target.value) } as Mapping)}>
                  <option value={-1}>— Pas dans le fichier —</option>
                  {optionsCol.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          {map.etage < 0 && (
            <div className="genrow">
              <label className="flex small" style={{ gap: 8 }}>
                <input type="checkbox" checked={depuisNumero} onChange={(e) => setDepuisNumero(e.target.checked)} />
                Déduire l’étage du numéro de lot (302 → 3e, 1204 → 12e)
              </label>
              <div className="field" style={{ marginTop: 8, marginBottom: 0, maxWidth: 260 }}>
                <label>Sinon, étage par défaut</label>
                <select value={etageDefaut} onChange={(e) => setEtageDefaut(Number(e.target.value))}>
                  {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
                </select>
              </div>
            </div>
          )}
          {map.batiment < 0 && data.batiments.length > 1 && (
            <div className="field">
              <label>Bâtiment pour toutes les lignes</label>
              <select value={batDefaut} onChange={(e) => setBatDefaut(e.target.value)}>
                {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </div>
          )}

          {map.numero < 0 ? (
            <div className="notice warn">Indiquez la colonne du lot / logement.</div>
          ) : (
            <>
              <div className="lbl">Aperçu ({valides.length} logement{valides.length > 1 ? 's' : ''}{sansEtage ? `, ${sansEtage} sans étage reconnu ignoré${sansEtage > 1 ? 's' : ''}` : ''})</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 14 }}>
                <table className="list">
                  <thead><tr><th>Bâtiment</th><th>Étage</th><th>Lot</th><th>Nom</th><th>Téléphone</th><th>E-mail</th></tr></thead>
                  <tbody>
                    {lignes.slice(0, 8).map((l, i) => (
                      <tr key={i} style={l.etage === null ? { opacity: 0.45 } : undefined}>
                        <td>{l.batiment || (data.batiments.find((b) => b.id === batDefaut)?.nom ?? '')}</td>
                        <td>{l.etage === null ? '?' : etageLabel(l.etage)}</td>
                        <td>{l.numero}</td><td>{l.nom}</td><td>{l.tel}</td><td>{l.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lignes.length > 8 && <p className="muted small" style={{ marginTop: -8 }}>… et {lignes.length - 8} autre(s) ligne(s).</p>}
            </>
          )}
          <div className="notice info small">
            Les logements déjà présents sont complétés (coordonnées), pas dupliqués. Ces coordonnées ne sont visibles que par vous, le gardien et le technicien,
            et sont effacées avec les données personnelles de la campagne.
          </div>
          <div className="btns">
            <button className="btn" disabled={busy || valides.length === 0} onClick={importer}>{busy ? 'Import…' : `Importer ${valides.length} logement${valides.length > 1 ? 's' : ''}`}</button>
            <button className="btn ghost" onClick={fermer}>Annuler</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

