'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { Modal } from './ui';
import { rpc } from '@/lib/api';
import { ETAGES_POSSIBLES, etageLabel, groupBy, heure, jourCourt, parseNumeros, sortLots } from '@/lib/format';
import type { Lot } from '@/lib/types';

export default function LotsPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, openBooking } = ctx;
  const multiBat = data.batiments.length > 1;
  const [fBat, setFBat] = useState('');
  const [fStat, setFStat] = useState<'tous' | 'attente' | 'inscrits'>('tous');

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
      alert(n === total ? `${n} logement${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.` : `${n} ajouté(s), ${total - n} existai(en)t déjà.`);
    }
  }

  function startEdit(l: Lot) {
    setEditing(l);
    setEBat(l.batiment_id);
    setEEtage(String(l.etage));
    setENum(l.numero);
  }

  return (
    <>
      <div className="card no-print">
        <h2>Ajouter des logements</h2>
        <p className="hint">
          La liste sert à suivre qui est inscrit et qui reste à relancer. Elle peut rester vide : les occupants peuvent aussi saisir leur logement eux-mêmes.
        </p>
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
      </div>

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
                        <div key={l.id} className={`lotcell ${r ? 'done' : 'todo'}`}>
                          <div className="flex" style={{ gap: 6 }}>
                            <span className="n grow">Lot {l.numero}</span>
                            <button className="linkbtn small no-print" onClick={() => startEdit(l)} title="Modifier">Modifier</button>
                          </div>
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
          <div className="btns">
            <button className="btn"
              onClick={async () => {
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
    </>
  );
}
