'use client';

import { useMemo, useState } from 'react';
import { Modal } from './ui';
import { errMsg, rpc } from '@/lib/api';
import { ETAGES_POSSIBLES, NUMEROTATIONS, etageLabel } from '@/lib/format';
import type { Batiment, Lot, Numerotation } from '@/lib/types';

/** Devine la numérotation utilisée dans un bâtiment */
function detecter(lots: Lot[]): Numerotation {
  if (lots.length === 0) return 'etage';
  if (lots.every((l) => /^[A-Z]$/.test(l.numero))) return 'lettre';
  const parEtage = lots.every((l) => {
    if (!/^\d+$/.test(l.numero)) return /^SS\d+-\d+$/.test(l.numero);
    const n = parseInt(l.numero, 10);
    return l.etage > 0 ? Math.floor(n / 100) === l.etage : l.etage === 0 ? n < 100 && l.numero.length === 2 : false;
  });
  return parEtage ? 'etage' : 'continue';
}

const tri = (a: Lot, b: Lot) => a.numero.localeCompare(b.numero, 'fr', { numeric: true });

export default function BatimentEditor({ token, opId, batiment, lots, seulBatiment, onClose, onDone }: {
  token: string; opId: string; batiment: Batiment; lots: Lot[]; seulBatiment: boolean;
  onClose: () => void; onDone: (msg: string) => Promise<void> | void;
}) {
  const initCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const l of lots) m[l.etage] = (m[l.etage] ?? 0) + 1;
    return m;
  }, [lots]);
  const etagesExistants = Object.keys(initCounts).map(Number);
  const [nom, setNom] = useState(batiment.nom === 'Bâtiment unique' ? '' : batiment.nom);
  const [min, setMin] = useState(etagesExistants.length ? Math.min(...etagesExistants) : 0);
  const [max, setMax] = useState(etagesExistants.length ? Math.max(...etagesExistants) : 5);
  const [counts, setCounts] = useState<Record<number, number>>(initCounts);
  const [num, setNum] = useState<Numerotation>(detecter(lots));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const etages: number[] = [];
  for (let e = max; e >= min; e--) etages.push(e);
  const horsPlage = etagesExistants.filter((e) => (e < min || e > max) && initCounts[e] > 0);
  const nb = (e: number) => (e < min || e > max ? 0 : counts[e] ?? 0);
  const total = etages.reduce((t, e) => t + nb(e), 0);
  const protege = (l: Lot) => l.reserve || !!l.visite;
  const minPossible = (e: number) => lots.filter((l) => l.etage === e && protege(l)).length;

  const changements = useMemo(() => {
    const all = new Set([...etagesExistants, ...etages]);
    let plus = 0, moins = 0;
    all.forEach((e) => { const d = nb(e) - (initCounts[e] ?? 0); if (d > 0) plus += d; else moins -= d; });
    return { plus, moins };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, min, max]);

  async function enregistrer() {
    setErr('');
    for (const e of [...etagesExistants, ...etages]) {
      if (nb(e) < minPossible(e)) {
        setErr(`${etageLabel(e)} : ${minPossible(e)} logement(s) ont un rendez-vous ou une visite et ne peuvent pas être retirés.`);
        return;
      }
    }
    setBusy(true);
    try {
      const r = await rpc<{ ajoutes: number; retires: number }>('staff_update_structure', {
        p_token: token, p_op: opId, p_batiment: batiment.id, p_nom: nom.trim() || (seulBatiment ? 'Bâtiment unique' : batiment.nom),
        p_etages: etages.map((e) => ({ etage: e, nb: nb(e) })), p_numerotation: num,
      });
      const parts = [];
      if (r.ajoutes) parts.push(`${r.ajoutes} ajouté${r.ajoutes > 1 ? 's' : ''}`);
      if (r.retires) parts.push(`${r.retires} retiré${r.retires > 1 ? 's' : ''}`);
      await onDone(parts.length ? `Bâtiment mis à jour : ${parts.join(', ')}` : 'Bâtiment mis à jour');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  async function supprimer() {
    const msg = seulBatiment
      ? 'Supprimer tous les logements de ce bâtiment ? (C’est le seul bâtiment : il sera vidé, pas supprimé.)'
      : `Supprimer « ${batiment.nom} » et tous ses logements ?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const r = await rpc<string>('staff_delete_batiment', { p_token: token, p_op: opId, p_batiment: batiment.id });
      await onDone(r === 'vide' ? 'Logements supprimés' : 'Bâtiment supprimé');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  async function renommerLot(l: Lot) {
    const v = prompt(`Nouveau numéro pour le lot ${l.numero} (${etageLabel(l.etage)}) :`, l.numero);
    if (!v || v.trim() === l.numero) return;
    try {
      await rpc('staff_update_lot', { p_token: token, p_op: opId, p_lot: l.id, p_batiment: batiment.id, p_etage: l.etage, p_numero: v.trim() });
      await onDone('Numéro modifié');
    } catch (e) { alert(errMsg(e)); }
  }

  async function supprimerLot(l: Lot) {
    if (!confirm(`Supprimer le lot ${l.numero} ?`)) return;
    try {
      await rpc('staff_delete_lot', { p_token: token, p_op: opId, p_lot: l.id });
      setCounts((c) => ({ ...c, [l.etage]: Math.max(0, (c[l.etage] ?? 1) - 1) }));
      await onDone('Logement supprimé');
    } catch (e) { alert(errMsg(e)); }
  }

  return (
    <Modal title={`Modifier ${batiment.nom === 'Bâtiment unique' ? 'le bâtiment' : `« ${batiment.nom} »`}`} onClose={onClose} wide>
      <div className="field">
        <label>Nom du bâtiment {seulBatiment && <span className="opt">(facultatif s’il n’y en a qu’un)</span>}</label>
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Bâtiment A, BAT 18, Escalier 2…" />
      </div>
      <div className="row3">
        <div className="field">
          <label>Du</label>
          <select value={min} onChange={(e) => { const v = Number(e.target.value); setMin(v); if (max < v) setMax(v); }}>
            {ETAGES_POSSIBLES.map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Au</label>
          <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
            {ETAGES_POSSIBLES.filter((x) => x >= min).map((x) => <option key={x} value={x}>{etageLabel(x)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Numéros des lots ajoutés</label>
          <select value={num} onChange={(e) => setNum(e.target.value as Numerotation)}>
            {NUMEROTATIONS.map((n) => <option key={n.v} value={n.v}>{n.label}</option>)}
          </select>
        </div>
      </div>

      {horsPlage.length > 0 && (
        <div className="notice warn">
          Les logements {horsPlage.map(etageLabel).join(', ')} seront supprimés (hors de la plage d’étages choisie).
        </div>
      )}

      <p className="hint" style={{ marginBottom: 8 }}>Réglez le nombre de logements par étage. Touchez un numéro pour le renommer.</p>
      <div className="etagegrid" style={{ maxHeight: 420 }}>
        {etages.map((e) => {
          const ici = lots.filter((l) => l.etage === e).sort(tri);
          const n = nb(e);
          return (
            <div className="etagerow edit" key={e}>
              <span className="el">{etageLabel(e)}</span>
              <div className="stepper">
                <button type="button" aria-label="Moins" onClick={() => setCounts({ ...counts, [e]: Math.max(minPossible(e), n - 1) })}>−</button>
                <input type="number" min={0} max={60} value={n} aria-label={`Logements au ${etageLabel(e)}`}
                  onChange={(ev) => setCounts({ ...counts, [e]: Math.max(0, Math.min(60, Number(ev.target.value) || 0)) })} />
                <button type="button" aria-label="Plus" onClick={() => setCounts({ ...counts, [e]: Math.min(60, n + 1) })}>+</button>
              </div>
              <div className="lotchips">
                {ici.map((l) => (
                  <span key={l.id} className={`lotchip ${protege(l) ? 'lock' : ''}`} title={protege(l) ? 'Rendez-vous ou visite : non supprimable' : ''}>
                    <button type="button" className="nm" onClick={() => renommerLot(l)}>{l.numero}</button>
                    {!protege(l) && <button type="button" className="x" aria-label={`Supprimer le lot ${l.numero}`} onClick={() => supprimerLot(l)}>×</button>}
                  </span>
                ))}
                {n > ici.length && <span className="small" style={{ color: 'var(--ok)', fontWeight: 600 }}>+{n - ici.length} à créer</span>}
                {n < ici.length && <span className="small" style={{ color: 'var(--err)', fontWeight: 600 }}>−{ici.length - n} à retirer</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="preview" style={{ marginBottom: 14 }}>
        <b>{total} logements</b>
        {(changements.plus > 0 || changements.moins > 0) && (
          <> · {changements.plus > 0 && <span style={{ color: 'var(--ok)' }}>+{changements.plus} à créer </span>}
          {changements.moins > 0 && <span style={{ color: 'var(--err)' }}>−{changements.moins} à retirer</span>}</>
        )}
        <div>Les derniers numéros de l’étage sont retirés en premier. Un logement avec rendez-vous ou déjà visité n’est jamais supprimé.</div>
      </div>

      {err && <div className="notice err">{err}</div>}
      <div className="btns">
        <button className="btn" disabled={busy} onClick={enregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button className="btn ghost" disabled={busy} onClick={onClose}>Annuler</button>
        <span className="grow" />
        <button className="btn danger" disabled={busy} onClick={supprimer}>{seulBatiment ? 'Vider le bâtiment' : 'Supprimer le bâtiment'}</button>
      </div>
    </Modal>
  );
}
