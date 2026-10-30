'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { Modal } from './ui';
import BatimentEditor from './BatimentEditor';
import BatimentGen, { defaultSpec, genTotal, runGen, type GenSpec } from './BatimentGen';
import { rpc } from '@/lib/api';
import { ETAGES_POSSIBLES, etageLabel, groupBy, heure, jourCourt, parseNumeros, sortLots } from '@/lib/format';
import type { Lot, Visite } from '@/lib/types';

export default function LotsPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, openBooking, notify } = ctx;
  const multiBat = data.batiments.length > 1;
  const [fBat, setFBat] = useState('');
  const [fStat, setFStat] = useState<'tous' | 'attente' | 'inscrits' | 'avoir' | 'vus'>('tous');
  const seulDefautVide = data.batiments.length === 1 && data.batiments[0].nom === 'Bâtiment unique' && data.lots.length === 0;
  const [gTarget, setGTarget] = useState<string>(''); // '' = nouveau bâtiment, sinon id à compléter
  const [gSpec, setGSpec] = useState<GenSpec>(defaultSpec(seulDefautVide ? '' : `Bâtiment ${'ABCDEFGHIJ'[data.batiments.length] ?? data.batiments.length + 1}`));
  const [editBat, setEditBat] = useState<string | null>(null);
  const [eVisite, setEVisite] = useState<string>('');
  const [eNote, setENote] = useState('');

  const [aBat, setABat] = useState(data.batiments[0]?.id ?? '');
  const [aDe, setADe] = useState('0');
  const [aA, setAA] = useState('0');
  const [aNums, setANums] = useState('');
  const [editing, setEditing] = useState<Lot | null>(null);
  const [eBat, setEBat] = useState('');
  const [eEtage, setEEtage] = useState('0');
  const [eNum, setENum] = useState('');

  const resaByLot = new Map(data.reservations.map((r) => [r.lot_id, r]));
  const cMap = new Map(data.creneaux.map((c) => [c.id, c]));

  let lots = sortLots(data.lots, data.batiments);
  if (fBat) lots = lots.filter((l) => l.batiment_id === fBat);
  if (fStat === 'attente') lots = lots.filter((l) => !l.reserve);
  if (fStat === 'inscrits') lots = lots.filter((l) => l.reserve);
  if (fStat === 'avoir') lots = lots.filter((l) => l.visite !== 'vu');
  if (fStat === 'vus') lots = lots.filter((l) => l.visite === 'vu');

  const parBat = groupBy(lots, (l) => l.batiment_id);
  const nums = parseNumeros(aNums);
  const de = parseInt(aDe, 10), a = parseInt(aA, 10);
  const etages = a >= de ? Array.from({ length: a - de + 1 }, (_, i) => de + i) : [de];
  const total = nums.length * etages.length;

  async function ajouter() {
    if (!aBat || nums.length === 0) return;
    let n = 0;
    const ok = await act(async () => {
      for (const e of etages) {
        n += await rpc<number>('staff_add_lots', { p_token: token, p_op: opId, p_batiment: aBat, p_lots: nums.map((numero) => ({ etage: e, numero })) });
      }
    });
    if (ok) {
      setANums('');
      notify(n === total ? `${n} logement${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : `${n} ajouté(s), ${total - n} existai(en)t déjà`);
    }
  }

  function startEdit(l: Lot) {
    setEditing(l);
    setEBat(l.batiment_id);
    setEEtage(String(l.etage));
    setENum(l.numero);
    setEVisite(l.visite ?? '');
    setENote(l.visite_note ?? '');
  }

  async function generer() {
    const nom = gSpec.nom.trim() || (seulDefautVide ? 'Bâtiment unique' : '');
    if (!gTarget && !nom) { alert('Merci de donner un nom au bâtiment.'); return; }
    let r: { crees: number } = { crees: 0 };
    const ok = await act(async () => {
      r = await runGen(token, opId, gTarget || null, nom, gSpec);
    });
    if (ok) {
      const total = genTotal(gSpec);
      notify(r.crees === total ? `${r.crees} logements créés` : `${r.crees} créés, ${total - r.crees} existaient déjà`);
      setGTarget('');
      setGSpec(defaultSpec(`Bâtiment ${'ABCDEFGHIJ'[data.batiments.length + (gTarget ? 0 : 1)] ?? ''}`.trim()));
    }
  }

  return (
    <>
      {!seulDefautVide && (
        <div className="card no-print">
          <h2>Bâtiments</h2>
          <p className="hint">Pour changer le nom, le nombre d’étages ou de logements par étage, ou renommer des lots : « Modifier ».</p>
          <div className="batlist">
            {data.batiments.map((b) => {
              const ls = data.lots.filter((l) => l.batiment_id === b.id);
              const ets = Array.from(new Set(ls.map((l) => l.etage))).sort((x, y) => x - y);
              return (
                <div className="batitem" key={b.id}>
                  <div className="grow">
                    <div className="nm">{b.nom}</div>
                    <div className="info">
                      {ls.length === 0 ? 'Aucun logement' : `${ls.length} logement${ls.length > 1 ? 's' : ''} · ${ets.length > 1 ? `${etageLabel(ets[0])} → ${etageLabel(ets[ets.length - 1])}` : etageLabel(ets[0])}`}
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => setEditBat(b.id)}>Modifier</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card no-print">
        <h2>{seulDefautVide ? 'Décrire l’immeuble' : 'Ajouter un bâtiment'}</h2>
        <p className="hint">
          Indiquez les étages et le nombre de logements par étage : la liste est générée automatiquement.
          Elle sert à suivre qui est inscrit, qui reste à relancer et ce que le technicien a vu. Elle peut aussi rester vide : les occupants saisissent alors leur logement eux-mêmes.
        </p>
        <BatimentGen spec={gSpec} onChange={setGSpec} nomFacultatif={seulDefautVide} />
        <button className="btn" disabled={genTotal(gSpec) === 0} onClick={generer}>
          Générer {genTotal(gSpec)} logement{genTotal(gSpec) > 1 ? 's' : ''}
        </button>
      </div>

      <details className="card no-print">
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--navy)' }}>Ajouter des logements un par un</summary>
        <p className="hint" style={{ marginTop: 10 }}>Pour les cas particuliers : loge, local commercial, numéros irréguliers…</p>
        <div className={multiBat ? 'row4' : 'row3'}>
          {multiBat && (
            <div className="field">
              <label>Bâtiment</label>
              <select value={aBat} onChange={(e) => setABat(e.target.value)}>
                {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Du</label>
            <select value={aDe} onChange={(e) => { setADe(e.target.value); if (parseInt(aA, 10) < parseInt(e.target.value, 10)) setAA(e.target.value); }}>
              {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Au</label>
            <select value={aA} onChange={(e) => setAA(e.target.value)}>
              {ETAGES_POSSIBLES.filter((x) => x >= de).map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Numéros de lot</label>
            <input type="text" value={aNums} onChange={(e) => setANums(e.target.value)} placeholder="ex. 1-6 ou A, B, C" />
          </div>
        </div>
        <div className="flex">
          <button className="btn" disabled={nums.length === 0} onClick={ajouter}>
            Ajouter {total > 0 ? `${total} logement${total > 1 ? 's' : ''}` : ''}
          </button>
          {etages.length > 1 && nums.length > 0 && (
            <span className="muted small">Les numéros {nums.slice(0, 6).join(', ')}{nums.length > 6 ? '…' : ''} seront créés à chacun des {etages.length} étages.</span>
          )}
        </div>
      </details>

      <div className="card">
        <div className="flex" style={{ marginBottom: 14 }}>
          <h2 className="grow" style={{ margin: 0 }}>Logements</h2>
          {multiBat && (
            <select value={fBat} onChange={(e) => setFBat(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Tous les bâtiments</option>
              {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          )}
          <div className="seg">
            <button className={fStat === 'tous' ? 'on' : ''} onClick={() => setFStat('tous')}>Tous</button>
            <button className={fStat === 'attente' ? 'on' : ''} onClick={() => setFStat('attente')}>En attente</button>
            <button className={fStat === 'inscrits' ? 'on' : ''} onClick={() => setFStat('inscrits')}>Inscrits</button>
            <button className={fStat === 'avoir' ? 'on' : ''} onClick={() => setFStat('avoir')}>À visiter</button>
            <button className={fStat === 'vus' ? 'on' : ''} onClick={() => setFStat('vus')}>Visités</button>
          </div>
        </div>

        {data.lots.length === 0 && <div className="notice info">Aucun logement saisi pour l’instant.</div>}
        {data.lots.length > 0 && lots.length === 0 && <div className="notice ok">Aucun logement dans ce filtre.</div>}

        {data.batiments.filter((b) => parBat.has(b.id)).map((b) => {
          const parEtage = groupBy(parBat.get(b.id)!, (l) => String(l.etage));
          const ets = Array.from(parEtage.keys()).map(Number).sort((x, y) => x - y);
          return (
            <div key={b.id} style={{ marginBottom: 12 }}>
              {multiBat && <h3 style={{ marginTop: 8 }}>{b.nom}</h3>}
              {ets.map((e) => (
                <div key={e} style={{ marginBottom: 12 }}>
                  <div className="lbl muted">{etageLabel(e)}</div>
                  <div className="lotgrid">
                    {parEtage.get(String(e))!.map((l) => {
                      const r = resaByLot.get(l.id);
                      const c = r ? cMap.get(r.creneau_id) : undefined;
                      return (
                        <div key={l.id} className={`lotcell ${l.visite ? l.visite : r ? 'done' : 'todo'}`}>
                          <div className="flex" style={{ gap: 6 }}>
                            <span className="n grow">Lot {l.numero}</span>
                            {l.visite === 'vu' && <span className="badge vu">Visité ✓</span>}
                            {l.visite === 'absent' && <span className="badge absent">Absent</span>}
                            <button className="linkbtn small no-print" onClick={() => startEdit(l)} title="Modifier">Modifier</button>
                          </div>
                          {l.visite_note && <div className="s" style={{ fontStyle: 'italic' }}>« {l.visite_note} »</div>}
                          {r && c ? (
                            <div className="s">{r.nom}<br />{jourCourt(c.jour)} · {heure(c.debut)}</div>
                          ) : (
                            <div className="s">
                              En attente
                              <div style={{ marginTop: 6 }} className="no-print">
                                <button className="btn ghost sm" onClick={() => openBooking({ lot: l.id })}>Inscrire</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={`Modifier le lot ${editing.numero}`} onClose={() => setEditing(null)}>
          {multiBat && (
            <div className="field">
              <label>Bâtiment</label>
              <select value={eBat} onChange={(e) => setEBat(e.target.value)}>
                {data.batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </div>
          )}
          <div className="row">
            <div className="field">
              <label>Étage</label>
              <select value={eEtage} onChange={(e) => setEEtage(e.target.value)}>
                {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Numéro</label>
              <input type="text" value={eNum} onChange={(e) => setENum(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Visite du technicien</label>
            <div className="seg">
              <button type="button" className={eVisite === '' ? 'on' : ''} onClick={() => setEVisite('')}>À faire</button>
              <button type="button" className={eVisite === 'vu' ? 'on' : ''} onClick={() => setEVisite('vu')}>Visité</button>
              <button type="button" className={eVisite === 'absent' ? 'on' : ''} onClick={() => setEVisite('absent')}>Absent</button>
            </div>
          </div>
          {eVisite !== '' && (
            <div className="field"><label>Note de visite</label><input type="text" value={eNote} onChange={(e) => setENote(e.target.value)} /></div>
          )}
          <div className="btns">
            <button className="btn"
              onClick={async () => {
                if ((eVisite || null) !== (editing.visite ?? null) || (eNote || '') !== (editing.visite_note ?? '')) {
                  if (!(await act(() => rpc('staff_set_visite', { p_token: token, p_op: opId, p_lot: editing.id, p_statut: (eVisite || null) as Visite, p_note: eNote })))) return;
                }
                if (await act(() => rpc('staff_update_lot', { p_token: token, p_op: opId, p_lot: editing.id, p_batiment: eBat, p_etage: parseInt(eEtage, 10), p_numero: eNum }), 'Logement modifié')) setEditing(null);
              }}>
              Enregistrer
            </button>
            {!editing.reserve && (
              <button className="btn danger"
                onClick={async () => {
                  if (confirm(`Supprimer le lot ${editing.numero} ?`) &&
                    (await act(() => rpc('staff_delete_lot', { p_token: token, p_op: opId, p_lot: editing.id }), 'Logement supprimé'))) setEditing(null);
                }}>
                Supprimer
              </button>
            )}
            <button className="btn ghost" onClick={() => setEditing(null)}>Fermer</button>
          </div>
          {editing.reserve && <p className="muted small">Ce logement a un rendez-vous : annulez-le d’abord pour pouvoir le supprimer.</p>}
        </Modal>
      )}
      {editBat && data.batiments.find((b) => b.id === editBat) && (
        <BatimentEditor
          token={token} opId={opId}
          batiment={data.batiments.find((b) => b.id === editBat)!}
          lots={data.lots.filter((l) => l.batiment_id === editBat)}
          seulBatiment={data.batiments.length === 1}
          onClose={() => setEditBat(null)}
          onDone={async (m) => { await ctx.reload(); notify(m); }}
        />
      )}
    </>
  );
}
