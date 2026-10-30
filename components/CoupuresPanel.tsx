'use client';

import type { StaffCtx } from './StaffPage';
import { coupureCible } from './Coupures';
import { rpc } from '@/lib/api';
import { heure, jourLong, parisToday } from '@/lib/format';

/** Liste des coupures d'eau programmées (elles se créent avec les créneaux, case « coupure d'eau ») */
export default function CoupuresList({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act } = ctx;
  const coupures = data.coupures ?? [];
  if (coupures.length === 0) return null;

  return (
    <div className="card">
      <h2>💧 Coupures d’eau programmées</h2>
      <p className="hint">Annoncées aux occupants (page de réservation, confirmation, affiche), au gardien et au technicien.</p>
      <table className="list">
        <tbody>
          {coupures.map((k) => {
            const lies = data.creneaux.filter((c) => c.jour === k.jour && (c.batiment_id ?? null) === (k.batiment_id ?? null) && c.debut >= k.debut && c.fin <= k.fin);
            const pris = lies.reduce((t, c) => t + c.pris, 0);
            return (
              <tr key={k.id}>
                <td style={{ fontWeight: 600 }}>{jourLong(k.jour)}{k.jour < parisToday() && <span className="badge grey" style={{ marginLeft: 6 }}>passée</span>}</td>
                <td>{heure(k.debut)} – {heure(k.fin)}</td>
                <td>{coupureCible(k, data.batiments) || 'Immeuble'}</td>
                <td className="muted small">{lies.length ? `${lies.length} créneaux · ${pris} RDV` : ''}</td>
                <td style={{ width: 1 }}>
                  <button className="btn danger sm" onClick={() => confirm('Retirer cette coupure d’eau ? (Les créneaux de visite restent en place.)') &&
                    act(() => rpc('admin_delete_coupure', { p_token: token, p_op: opId, p_id: k.id }), 'Coupure retirée')}>Retirer</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
