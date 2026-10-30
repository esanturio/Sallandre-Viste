'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { rpc } from '@/lib/api';
import { heure, isFuture, jourCourt, lotLabel, sortLots } from '@/lib/format';
import { messageInvitation } from '@/lib/poster';
import type { Lot } from '@/lib/types';

const telLien = (t: string) => t.replace(/[^\d+]/g, '');

/** Logements marqués « Absent » par le technicien : à reprogrammer */
export default function AbsentsCard({ ctx, tenantToken }: { ctx: StaffCtx; tenantToken?: string }) {
  const { data, token, opId, act } = ctx;
  const [cible, setCible] = useState<Record<string, string>>({});
  const absents = sortLots(data.lots.filter((l) => l.visite === 'absent'), data.batiments);
  if (absents.length === 0) return null;

  const resaByLot = new Map(data.reservations.map((r) => [r.lot_id, r]));
  const cMap = new Map(data.creneaux.map((c) => [c.id, c]));
  const url = tenantToken && typeof window !== 'undefined' ? `${window.location.origin}/r/${tenantToken}` : '';
  const msg = url ? messageInvitation(data.operation, url) : '';

  const creneauxPour = (l: Lot, actuel?: string) =>
    data.creneaux.filter((c) => isFuture(c) && c.id !== actuel && c.pris < c.capacite && (!c.batiment_id || c.batiment_id === l.batiment_id));

  return (
    <div className="card no-print" style={{ borderColor: '#f1c4bf' }}>
      <div className="flex">
        <h2 className="grow" style={{ margin: 0 }}>Absents à reprogrammer</h2>
        <span className="badge absent">{absents.length}</span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        <b>Déplacer</b> : vous fixez vous-même un nouveau créneau (pensez à prévenir l’occupant).<br />
        <b>Libérer</b> : le rendez-vous est annulé et l’occupant reprend un créneau lui-même avec le lien ; ses coordonnées sont conservées pour la relance.
      </p>
      {absents.map((l) => {
        const r = resaByLot.get(l.id);
        const c = r ? cMap.get(r.creneau_id) : undefined;
        const nom = r?.nom ?? l.occupant_nom ?? '';
        const tel = (r && r.telephone !== '—' ? r.telephone : null) ?? l.occupant_tel ?? '';
        const options = creneauxPour(l, r?.creneau_id);
        const choisi = cible[l.id] ?? '';
        return (
          <div className="resa" key={l.id}>
            <div className="top">
              <span className="lot">{lotLabel(l, data.batiments)}</span>
              {nom && <span className="who">{nom}</span>}
              {(l.absences ?? 0) > 0 && <span className="badge absent">déjà absent {l.absences}×</span>}
            </div>
            <div className="meta">
              {c && <span>RDV manqué : {jourCourt(c.jour)} {heure(c.debut)}</span>}
              {tel && <a href={`tel:${telLien(tel)}`}>{tel}</a>}
              {l.visite_note && <span>Note : « {l.visite_note} »</span>}
            </div>
            <div className="acts btns">
              {r && (
                <>
                  <select value={choisi} onChange={(e) => setCible({ ...cible, [l.id]: e.target.value })} style={{ width: 'auto', padding: '6px 8px', fontSize: 14 }}>
                    <option value="">— Nouveau créneau —</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{jourCourt(o.jour)} · {heure(o.debut)}–{heure(o.fin)}</option>)}
                  </select>
                  <button className="btn sm" disabled={!choisi}
                    onClick={() => act(() => rpc('staff_reprogrammer', { p_token: token, p_op: opId, p_lot: l.id, p_creneau: choisi }), 'Rendez-vous déplacé')}>
                    Déplacer
                  </button>
                </>
              )}
              <button className="btn ghost sm"
                onClick={() => confirm(r ? 'Annuler ce rendez-vous pour que l’occupant reprenne un créneau lui-même ?' : 'Remettre ce logement « à faire » ?') &&
                  act(() => rpc('staff_reprogrammer', { p_token: token, p_op: opId, p_lot: l.id, p_creneau: null }), r ? 'Rendez-vous libéré' : 'Logement remis à faire')}>
                {r ? 'Libérer' : 'Remettre à faire'}
              </button>
              {tel && msg && <a className="btn ghost sm" href={`sms:${telLien(tel)}?&body=${encodeURIComponent(msg)}`}>💬 SMS avec le lien</a>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
