'use client';

import { ETAGES_POSSIBLES, NUMEROTATIONS, etageLabel, numeroGenere } from '@/lib/format';
import type { Numerotation } from '@/lib/types';

export type GenSpec = { nom: string; min: number; max: number; par: number; num: Numerotation };

export const defaultSpec = (nom = ''): GenSpec => ({ nom, min: 0, max: 5, par: 4, num: 'etage' });

export function genTotal(s: GenSpec) {
  return s.max >= s.min && s.par > 0 ? (s.max - s.min + 1) * s.par : 0;
}

function apercu(s: GenSpec): string {
  if (!genTotal(s)) return '';
  let k = 0;
  const etage = (e: number) => {
    const out: string[] = [];
    for (let i = 1; i <= s.par; i++) { k++; out.push(numeroGenere(s.num, e, i, k)); }
    return out.length > 4 ? `${out.slice(0, 3).join(', ')}… ${out[out.length - 1]}` : out.join(', ');
  };
  const first = `${etageLabel(s.min)} : ${etage(s.min)}`;
  if (s.max === s.min) return first;
  for (let e = s.min + 1; e < s.max; e++) for (let i = 1; i <= s.par; i++) k++;
  return `${first}  ·  ${etageLabel(s.max)} : ${etage(s.max)}`;
}

/** Champs : (nom) · du · au · lots par étage · numérotation, avec aperçu */
export default function BatimentGen({ spec, onChange, showNom = true, nomFacultatif, onRemove }: {
  spec: GenSpec; onChange: (s: GenSpec) => void; showNom?: boolean; nomFacultatif?: boolean; onRemove?: () => void;
}) {
  const set = (p: Partial<GenSpec>) => onChange({ ...spec, ...p });
  const total = genTotal(spec);
  return (
    <div className="genrow">
      {showNom && (
        <div className="flex" style={{ flexWrap: 'nowrap', marginBottom: 10 }}>
          <input type="text" value={spec.nom} onChange={(e) => set({ nom: e.target.value })} placeholder={nomFacultatif ? "Nom du bâtiment (facultatif s’il n’y en a qu’un)" : "Nom du bâtiment (ex. Bâtiment A, Escalier 2…)"} aria-label="Nom du bâtiment" />
          {onRemove && <button type="button" className="xbtn" onClick={onRemove} aria-label="Retirer ce bâtiment">×</button>}
        </div>
      )}
      <div className="row4 keep2">
        <div className="field">
          <label>Du</label>
          <select value={spec.min} onChange={(e) => { const v = Number(e.target.value); set({ min: v, max: Math.max(v, spec.max) }); }}>
            {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Au</label>
          <select value={spec.max} onChange={(e) => set({ max: Number(e.target.value) })}>
            {ETAGES_POSSIBLES.filter((x) => x >= spec.min).map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Lots par étage</label>
          <input type="number" min={1} max={60} value={spec.par} onChange={(e) => set({ par: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
        </div>
        <div className="field">
          <label>Numérotation</label>
          <select value={spec.num} onChange={(e) => set({ num: e.target.value as Numerotation })}>
            {NUMEROTATIONS.map((n) => <option key={n.v} value={n.v}>{n.label}</option>)}
          </select>
        </div>
      </div>
      {total > 0 && (
        <div className="preview">
          <b>{spec.max - spec.min + 1} étage{spec.max > spec.min ? 's' : ''} × {spec.par} = {total} logements</b> — {apercu(spec)}
        </div>
      )}
    </div>
  );
}
