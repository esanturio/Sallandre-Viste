'use client';

import { useState } from 'react';
import type { StaffCtx } from './StaffPage';
import { lotLabel, sortLots } from '@/lib/format';
import { messageInvitation } from '@/lib/poster';

const telLien = (t: string) => t.replace(/[^\d+]/g, '');

/** Relance des occupants connus qui n'ont pas encore pris rendez-vous */
export default function RelanceCard({ ctx, tenantToken }: { ctx: StaffCtx; tenantToken?: string }) {
  const { data, notify } = ctx;
  const [ouvert, setOuvert] = useState(false);
  const aRelancer = sortLots(data.lots.filter((l) => !l.reserve && l.visite !== 'vu' && (l.occupant_tel || l.occupant_email)), data.batiments);
  if (aRelancer.length === 0 || !tenantToken) return null;

  const url = typeof window !== 'undefined' ? `${window.location.origin}/r/${tenantToken}` : '';
  const msg = messageInvitation(data.operation, url);
  const tels = aRelancer.map((l) => l.occupant_tel).filter(Boolean) as string[];
  const mails = aRelancer.map((l) => l.occupant_email).filter(Boolean) as string[];
  const copier = async (t: string, ok: string) => { try { await navigator.clipboard.writeText(t); notify(ok); } catch { prompt('Copiez :', t); } };

  return (
    <div className="card no-print">
      <div className="flex">
        <h2 className="grow" style={{ margin: 0 }}>Relancer les occupants sans rendez-vous</h2>
        <span className="badge warn">{aRelancer.length} à relancer</span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>Coordonnées issues de la liste importée (ou d’un rendez-vous libéré). Chaque bouton ouvre un message prêt avec le lien de réservation.</p>
      <div className="btns" style={{ marginBottom: 10 }}>
        <button className="btn ghost sm" onClick={() => copier(msg, 'Message copié')}>Copier le message</button>
        {tels.length > 0 && <button className="btn ghost sm" onClick={() => copier(tels.join(', '), `${tels.length} numéro(s) copié(s)`)}>Copier les {tels.length} numéros</button>}
        {mails.length > 0 && <a className="btn ghost sm" href={`mailto:?bcc=${encodeURIComponent(mails.join(','))}&subject=${encodeURIComponent('Prise de rendez-vous – ' + data.operation.objet)}&body=${encodeURIComponent(msg)}`}>E-mail groupé ({mails.length}, en copie cachée)</a>}
        <button className="btn ghost sm" onClick={() => setOuvert(!ouvert)}>{ouvert ? 'Masquer la liste' : 'Voir la liste'}</button>
      </div>
      {ouvert && (
        <table className="list">
          <tbody>
            {aRelancer.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{lotLabel(l, data.batiments)}{(l.absences ?? 0) > 0 && <span className="badge absent" style={{ marginLeft: 6 }}>absent {l.absences}×</span>}</td>
                <td>{l.occupant_nom ?? ''}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {l.occupant_tel && <a className="btn ghost sm" href={`sms:${telLien(l.occupant_tel)}?&body=${encodeURIComponent(msg)}`}>💬 SMS</a>}{' '}
                  {l.occupant_tel && <a className="btn ghost sm" href={`tel:${telLien(l.occupant_tel)}`}>📞 {l.occupant_tel}</a>}{' '}
                  {l.occupant_email && <a className="btn ghost sm" href={`mailto:${l.occupant_email}?subject=${encodeURIComponent('Prise de rendez-vous – ' + data.operation.objet)}&body=${encodeURIComponent(msg)}`}>✉️</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
