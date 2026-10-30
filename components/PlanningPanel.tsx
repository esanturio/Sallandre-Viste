'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { Modal } from './ui';
import AbsentsCard from './AbsentsCard';
import { rpc } from '@/lib/api';
import { opTitle, ORIGINE_LABEL, etageLabel, groupBy, heure, isFuture, jourCourt, jourLong, lotLabel, parisToday, sortLots } from '@/lib/format';
import type { Reservation } from '@/lib/types';

const VISITE_LABEL: Record<string, string> = { vu: 'Visité', absent: 'Absent', '': 'À faire' };

export default function PlanningPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act, openBooking } = ctx;
  const [passes, setPasses] = useState(false);
  const [masquerLibres, setMasquerLibres] = useState(false);
  const [moving, setMoving] = useState<Reservation | null>(null);
  const [cible, setCible] = useState('');

  const lotsById = new Map(data.lots.map((l) => [l.id, l]));
  const resaParCreneau = groupBy(data.reservations, (r) => r.creneau_id);
  const today = parisToday();
  const creneaux = data.creneaux.filter((c) => passes || c.jour >= today);
  const parJour = groupBy(creneaux, (c) => c.jour);
  const jours = Array.from(parJour.keys()).sort();
  const multiBat = data.batiments.length > 1;
  const nbPasses = data.creneaux.filter((c) => c.jour < today).length;

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cMap = new Map(data.creneaux.map((c) => [c.id, c]));
    const bMap = new Map(data.batiments.map((b) => [b.id, b.nom]));
    const head = ['Statut RDV', 'Date', 'Début', 'Fin', 'Bâtiment', 'Étage', 'Lot', 'Nom', 'Téléphone', 'E-mail', 'Informations', 'Inscrit', 'Visite', 'Note visite'];
    const rows: unknown[][] = [];
    const resaByLot = new Map(data.reservations.map((r) => [r.lot_id, r]));
    const sorted = [...data.reservations].sort((a, b) => {
      const ca = cMap.get(a.creneau_id)!, cb = cMap.get(b.creneau_id)!;
      return `${ca.jour}${ca.debut}`.localeCompare(`${cb.jour}${cb.debut}`);
    });
    for (const r of sorted) {
      const c = cMap.get(r.creneau_id)!;
      const l = lotsById.get(r.lot_id);
      rows.push(['Planifié', c.jour.split('-').reverse().join('/'), c.debut, c.fin, l ? bMap.get(l.batiment_id) : '', l ? etageLabel(l.etage) : '', l?.numero ?? '',
        r.nom, r.telephone, r.email ?? '', r.commentaire ?? '', ORIGINE_LABEL[r.created_by], VISITE_LABEL[l?.visite ?? ''] ?? '', l?.visite_note ?? '']);
    }
    for (const l of sortLots(data.lots, data.batiments)) {
      if (resaByLot.has(l.id)) continue;
      rows.push(['En attente', '', '', '', bMap.get(l.batiment_id), etageLabel(l.etage), l.numero, '', '', '', '', '', VISITE_LABEL[l.visite ?? ''] ?? '', l.visite_note ?? '']);
    }
    const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planning-${opTitle(data.operation).replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

    const batDe = (r: Reservation | null) => (r ? lotsById.get(r.lot_id)?.batiment_id : undefined);
  const cibles = data.creneaux.filter((c) => isFuture(c) && (c.pris < c.capacite || c.id === moving?.creneau_id) && (!c.batiment_id || c.batiment_id === batDe(moving)));

  return (
    <>
      <AbsentsCard ctx={ctx} tenantToken={ctx.isAdmin ? data.operation.tenant_token : data.tenant_token} />
      <div className="flex no-print" style={{ marginBottom: 14 }}>
        <label className="flex small" style={{ gap: 6 }}>
          <input type="checkbox" checked={masquerLibres} onChange={(e) => setMasquerLibres(e.target.checked)} /> Masquer les créneaux libres
        </label>
        {nbPasses > 0 && (
          <label className="flex small" style={{ gap: 6 }}>
            <input type="checkbox" checked={passes} onChange={(e) => setPasses(e.target.checked)} /> Afficher les jours passés
          </label>
        )}
        <div className="grow" />
        <button className="btn ghost sm" onClick={exportCsv}>Exporter (Excel)</button>
        <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
      </div>

      {jours.length === 0 && (
        <div className="card">
          <div className="notice info" style={{ margin: 0 }}>
            {data.creneaux.length === 0
              ? ctx.isAdmin ? 'Aucun créneau pour l’instant. Créez des dates dans l’onglet « Créneaux, liens et réglages ».' : 'Aucun créneau n’a encore été ouvert.'
              : 'Aucun créneau à venir.'}
          </div>
        </div>
      )}

      {jours.map((j) => {
        const slots = parJour.get(j)!;
        const total = slots.reduce((s, c) => s + c.pris, 0);
        const visibles = masquerLibres ? slots.filter((c) => c.pris > 0) : slots;
        if (visibles.length === 0) return null;
        return (
          <div className="card daygroup" key={j}>
            <h3>
              {jourLong(j)}
              <span className="badge">{total} RDV</span>
              {(data.coupures ?? []).filter((k) => k.jour === j).map((k) => (
                <span key={k.id} className="badge eau">💧 Coupure {heure(k.debut)}–{heure(k.fin)}{k.batiment_id ? ` · ${data.batiments.find((b) => b.id === k.batiment_id)?.nom ?? ''}` : ''}</span>
              ))}
            </h3>
            {visibles.map((c) => {
              const rs = resaParCreneau.get(c.id) ?? [];
              const libre = c.capacite - rs.length;
              return (
                <div className="slotrow" key={c.id}>
                  <div className="time">
                    {heure(c.debut)} – {heure(c.fin)}
                    {c.capacite > 1 && <small>{rs.length}/{c.capacite} places</small>}
                    {c.batiment_id && <small style={{ color: '#2f6f9a' }}>💧 {data.batiments.find((b) => b.id === c.batiment_id)?.nom}</small>}
                  </div>
                  <div>
                    {rs.map((r) => {
                      const l = lotsById.get(r.lot_id);
                      return (
                        <div className="resa" key={r.id}>
                          <div className="top">
                            <span className="lot">{l ? lotLabel(l, data.batiments, multiBat) : 'Logement ?'}</span>
                            <span className="who">{r.nom}</span>
                            {l?.visite === 'vu' && <span className="badge vu">Visité ✓</span>}
                            {l?.visite === 'absent' && <span className="badge absent">Absent</span>}
                            {(l?.absences ?? 0) > 0 && l?.visite !== 'absent' && <span className="badge warn">{(l?.absences ?? 0) + 1}e passage</span>}
                          </div>
                          <div className="meta">
                            <a href={`tel:${r.telephone.replace(/\s/g, '')}`}>{r.telephone}</a>
                            {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                            <span>Inscrit {ORIGINE_LABEL[r.created_by]}</span>
                          </div>
                          {r.commentaire && <div className="comm">« {r.commentaire} »</div>}
                          {l?.visite_note && <div className="comm">Technicien : « {l.visite_note} »</div>}
                          <div className="acts btns no-print">
                            <button className="btn ghost sm" onClick={() => { setMoving(r); setCible(r.creneau_id); }}>Déplacer</button>
                            <button className="btn danger sm"
                              onClick={() => confirm(`Annuler le rendez-vous de ${r.nom} ?`) &&
                                act(() => rpc('staff_cancel_reservation', { p_token: token, p_op: opId, p_res: r.id }), 'Rendez-vous annulé')}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {libre > 0 && (
                      <div className="free">
                        <span>{libre > 1 ? `${libre} places libres` : 'Libre'}</span>
                        <button className="btn ghost sm no-print" onClick={() => openBooking({ creneau: c.id })}>Inscrire ici</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {moving && (
        <Modal title="Déplacer le rendez-vous" onClose={() => setMoving(null)}>
          <p className="muted" style={{ marginTop: 0 }}>{moving.nom}</p>
          <div className="field">
            <label>Nouveau créneau</label>
            <select value={cible} onChange={(e) => setCible(e.target.value)}>
              {cibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {jourCourt(c.jour)} · {heure(c.debut)}–{heure(c.fin)}{c.id === moving.creneau_id ? ' (actuel)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="btns">
            <button className="btn" disabled={!cible || cible === moving.creneau_id}
              onClick={async () => {
                if (await act(() => rpc('staff_move_reservation', { p_token: token, p_op: opId, p_res: moving.id, p_creneau: cible }), 'Rendez-vous déplacé')) setMoving(null);
              }}>
              Déplacer
            </button>
            <button className="btn ghost" onClick={() => setMoving(null)}>Annuler</button>
          </div>
        </Modal>
      )}
    </>
  );
}
