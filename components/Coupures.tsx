import { heure, jourLong } from '@/lib/format';
import type { Batiment, Coupure } from '@/lib/types';

export function coupureCible(k: Coupure, batiments: Batiment[]): string {
  if (!k.batiment_id) return batiments.length > 1 ? 'Tout l’immeuble' : '';
  return batiments.find((b) => b.id === k.batiment_id)?.nom ?? '';
}

/** Coupures qui concernent un bâtiment (les siennes + celles de tout l'immeuble) */
export function coupuresPour(coupures: Coupure[] | undefined, batimentId?: string | null): Coupure[] {
  return (coupures ?? []).filter((k) => !k.batiment_id || !batimentId || k.batiment_id === batimentId);
}

export default function CoupuresBanner({ coupures, batiments, titre = 'Coupures d’eau prévues', compact }: {
  coupures: Coupure[]; batiments: Batiment[]; titre?: string; compact?: boolean;
}) {
  if (coupures.length === 0) return null;
  return (
    <div className="notice coupure" style={compact ? { marginBottom: 0 } : undefined}>
      <div className="ct">💧 {titre}</div>
      <ul>
        {coupures.map((k) => {
          const cible = coupureCible(k, batiments);
          return (
            <li key={k.id}>
              <b>{jourLong(k.jour)}</b> de {heure(k.debut)} à {heure(k.fin)}
              {cible && <span className="cb"> — {cible}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
