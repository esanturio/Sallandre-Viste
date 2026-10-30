'use client';

import { rpc } from '@/lib/api';
import { ETAGES_POSSIBLES, NUMEROTATIONS, etageLabel, numeroGenere } from '@/lib/format';
import type { Numerotation } from '@/lib/types';

export type GenSpec = {
  nom: string;
  min: number;
  max: number;
  par: number;                     // mode identique : lots par étage
  num: Numerotation;
  variable: boolean;               // true = nombre différent selon l'étage
  parEtage: Record<string, number>; // mode variable : étage -> nb de lots (0 possible)
};

export const defaultSpec = (nom = ''): GenSpec => ({ nom, min: 0, max: 5, par: 4, num: 'etage', variable: false, parEtage: {} });

/** Liste [{etage, nb}] de l'étage le plus bas au plus haut */
export function genEtages(s: GenSpec): { etage: number; nb: number }[] {
  if (s.max < s.min) return [];
  const out: { etage: number; nb: number }[] = [];
  for (let e = s.min; e <= s.max; e++) out.push({ etage: e, nb: s.variable ? s.parEtage[e] ?? s.par : s.par });
  return out;
}

export function genTotal(s: GenSpec) {
  return genEtages(s).reduce((t, x) => t + Math.max(0, x.nb), 0);
}

/** Crée (ou complète) un bâtiment côté base, en un seul appel */
export async function runGen(token: string, opId: string, batimentId: string | null, nom: string, s: GenSpec) {
  return rpc<{ batiment_id: string; crees: number }>('staff_generate_lots_detail', {
    p_token: token, p_op: opId, p_batiment: batimentId, p_nom: batimentId ? null : nom,
    p_etages: genEtages(s), p_numerotation: s.num,
  });
}

function apercuEtage(s: GenSpec, e: number): string {
  // Reproduit la numérotation "continue" en comptant les étages précédents
  let k = 0;
  for (const x of genEtages(s)) { if (x.etage >= e) break; k += x.nb; }
  const nb = genEtages(s).find((x) => x.etage === e)?.nb ?? 0;
  if (nb === 0) return '—';
  const out: string[] = [];
  for (let i = 1; i <= nb; i++) out.push(numeroGenere(s.num, e, i, k + i));
  return out.length > 4 ? `${out.slice(0, 3).join(', ')}… ${out[out.length - 1]}` : out.join(', ');
}

/** Champs : (nom) · du · au · lots par étage (identique ou variable) · numérotation, avec aperçu */
export default function BatimentGen({ spec, onChange, showNom = true, nomFacultatif, onRemove }: {
  spec: GenSpec; onChange: (s: GenSpec) => void; showNom?: boolean; nomFacultatif?: boolean; onRemove?: () => void;
}) {
  const set = (p: Partial<GenSpec>) => onChange({ ...spec, ...p });
  const total = genTotal(spec);
  const etages = genEtages(spec);
  const nbEtages = etages.length;

  function passerEnVariable(v: boolean) {
    if (!v) return set({ variable: false });
    const pe: Record<string, number> = {};
    for (let e = spec.min; e <= spec.max; e++) pe[e] = spec.parEtage[e] ?? spec.par;
    set({ variable: true, parEtage: pe });
  }

  return (
    <div className="genrow">
      {showNom && (
        <div className="flex" style={{ flexWrap: 'nowrap', marginBottom: 10 }}>
          <input type="text" value={spec.nom} onChange={(e) => set({ nom: e.target.value })} placeholder={nomFacultatif ? 'Nom du bâtiment (facultatif s’il n’y en a qu’un)' : 'Nom du bâtiment (ex. Bâtiment A, Escalier 2…)'} aria-label="Nom du bâtiment" />
          {onRemove && <button type="button" className="xbtn" onClick={onRemove} aria-label="Retirer ce bâtiment">×</button>}
        </div>
      )}
      <div className="row3">
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
          <label>Numérotation</label>
          <select value={spec.num} onChange={(e) => set({ num: e.target.value as Numerotation })}>
            {NUMEROTATIONS.map((n) => <option key={n.v} value={n.v}>{n.label}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Logements par étage</label>
        <div className="seg">
          <button type="button" className={!spec.variable ? 'on' : ''} onClick={() => passerEnVariable(false)}>Même nombre à chaque étage</button>
          <button type="button" className={spec.variable ? 'on' : ''} onClick={() => passerEnVariable(true)}>Différent selon l’étage</button>
        </div>
      </div>

      {!spec.variable ? (
        <div className="field" style={{ maxWidth: 200 }}>
          <input type="number" min={1} max={60} value={spec.par} aria-label="Lots par étage"
            onChange={(e) => set({ par: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
        </div>
      ) : (
        <div className="etagegrid">
          {[...etages].reverse().map(({ etage, nb }) => (
            <div className="etagerow" key={etage}>
              <span className="el">{etageLabel(etage)}</span>
              <div className="stepper">
                <button type="button" aria-label="Moins" onClick={() => set({ parEtage: { ...spec.parEtage, [etage]: Math.max(0, nb - 1) } })}>−</button>
                <input type="number" min={0} max={60} value={nb} aria-label={`Lots au ${etageLabel(etage)}`}
                  onChange={(e) => set({ parEtage: { ...spec.parEtage, [etage]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) } })} />
                <button type="button" aria-label="Plus" onClick={() => set({ parEtage: { ...spec.parEtage, [etage]: Math.min(60, nb + 1) } })}>+</button>
              </div>
              <span className="ap">{apercuEtage(spec, etage)}</span>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="preview">
          {spec.variable ? (
            <b>{nbEtages} étage{nbEtages > 1 ? 's' : ''} · {total} logements au total</b>
          ) : (
            <>
              <b>{nbEtages} étage{nbEtages > 1 ? 's' : ''} × {spec.par} = {total} logements</b>
              {' — '}{etageLabel(spec.min)} : {apercuEtage(spec, spec.min)}
              {spec.max > spec.min && <>{'  ·  '}{etageLabel(spec.max)} : {apercuEtage(spec, spec.max)}</>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
