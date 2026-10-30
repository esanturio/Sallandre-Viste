import { etageLabel, heure, jourLong } from '@/lib/format';
import type { Recap } from '@/lib/types';

export default function RecapCard({ r, showBat, immeuble, adresse, staff }: { r: Recap; showBat: boolean; immeuble?: string; adresse?: string | null; staff?: boolean }) {
  return (
    <div className="card recap">
      <div className="check">✓</div>
      <h2>{staff ? 'Rendez-vous enregistré' : 'Votre rendez-vous est confirmé'}</h2>
      <div className="when">{jourLong(r.jour)}</div>
      <div className="hour">{heure(r.debut)} – {heure(r.fin)}</div>
      <dl>
        {immeuble && (<><dt>Immeuble</dt><dd>{immeuble}{adresse ? <><br /><span className="muted small">{adresse}</span></> : null}</dd></>)}
        {showBat && (<><dt>Bâtiment</dt><dd>{r.batiment}</dd></>)}
        <dt>Étage</dt><dd>{etageLabel(r.etage)}</dd>
        <dt>Logement</dt><dd>Lot {r.numero}</dd>
        <dt>Nom</dt><dd>{r.nom}</dd>
      </dl>
      {!staff && (
        <p className="muted small" style={{ marginTop: 18 }}>
          Pensez à noter ce créneau ou à faire une capture d’écran.<br />
          Pour le modifier ou l’annuler, contactez votre gardien.
        </p>
      )}
    </div>
  );
}
