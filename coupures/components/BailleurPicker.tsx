'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react';
import { errMsg, rpc, type Bailleur } from '@/lib/api';

/** Réduit une image (logo) à 600×200 max et la renvoie en data URL (PNG si transparence possible, sinon JPEG) */
export async function preparerLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Merci de choisir une image (PNG, JPG, SVG…).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Image illisible.'));
      i.src = url;
    });
    const w0 = img.naturalWidth || 600, h0 = img.naturalHeight || 200;
    const k = Math.min(1, 600 / w0, 200 / h0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let data = c.toDataURL('image/png');
    if (data.length > 380000) data = c.toDataURL('image/jpeg', 0.85);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Choix du bailleur (logo conservé d'une campagne à l'autre) */
export default function BailleurPicker({ token, value, onChange }: { token: string; value: string | null; onChange: (id: string | null) => void }) {
  const [liste, setListe] = useState<Bailleur[] | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [nom, setNom] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setListe(await rpc<Bailleur[]>('admin_bailleurs', { p_token: token })); } catch (e) { setErr(errMsg(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function choisirFichier(f?: File | null) {
    setErr('');
    if (!f) return;
    try { setLogo(await preparerLogo(f)); } catch (e) { setErr((e as Error).message); }
  }

  async function creer() {
    setErr('');
    if (!nom.trim()) { setErr('Merci d’indiquer le nom du bailleur.'); return; }
    setBusy(true);
    try {
      const id = await rpc<string>('admin_save_bailleur', { p_token: token, p_id: null, p_nom: nom, p_logo: logo });
      await load();
      onChange(id);
      setNouveau(false); setNom(''); setLogo(null);
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }

  const choisi = liste?.find((b) => b.id === value);

  return (
    <div>
      <div className="flex" style={{ flexWrap: 'nowrap' }}>
        <select value={nouveau ? '__new' : value ?? ''} onChange={(e) => {
          if (e.target.value === '__new') { setNouveau(true); return; }
          setNouveau(false);
          onChange(e.target.value || null);
        }}>
          <option value="">— Aucun —</option>
          {(liste ?? []).map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          <option value="__new">+ Nouveau bailleur…</option>
        </select>
        {choisi?.logo && !nouveau && <img src={choisi.logo} alt={choisi.nom} style={{ height: 40, maxWidth: 140, objectFit: 'contain' }} />}
      </div>
      {nouveau && (
        <div className="genrow" style={{ marginTop: 10 }}>
          <div className="row">
            <div className="field">
              <label>Nom du bailleur</label>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Homya, Paris Habitat…" maxLength={120} />
            </div>
            <div className="field">
              <label>Logo <span className="opt">(PNG, JPG ou SVG)</span></label>
              <input type="file" accept="image/*" onChange={(e) => choisirFichier(e.target.files?.[0])} />
            </div>
          </div>
          {logo && <img src={logo} alt="Aperçu du logo" style={{ height: 50, maxWidth: 200, objectFit: 'contain', marginBottom: 10 }} />}
          <div className="btns">
            <button type="button" className="btn sm" disabled={busy} onClick={creer}>Enregistrer le bailleur</button>
            <button type="button" className="btn ghost sm" onClick={() => { setNouveau(false); setNom(''); setLogo(null); }}>Annuler</button>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Le bailleur et son logo restent enregistrés : vous le choisirez simplement dans la liste pour les prochains avis.</p>
        </div>
      )}
      {err && <div className="notice err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/** Gestion de la liste des bailleurs (renommer, changer de logo, supprimer) */
export function BailleursManager({ token }: { token: string }) {
  const [liste, setListe] = useState<Bailleur[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setListe(await rpc<Bailleur[]>('admin_bailleurs', { p_token: token })); setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function changerLogo(b: Bailleur, f?: File | null) {
    if (!f) return;
    try {
      const logo = await preparerLogo(f);
      await rpc('admin_save_bailleur', { p_token: token, p_id: b.id, p_nom: b.nom, p_logo: logo });
      await load();
    } catch (e) { alert(e instanceof Error && !(e as { code?: string }).code ? e.message : errMsg(e)); }
  }
  async function renommer(b: Bailleur) {
    const v = prompt('Nom du bailleur :', b.nom);
    if (!v || v.trim() === b.nom) return;
    try { await rpc('admin_save_bailleur', { p_token: token, p_id: b.id, p_nom: v, p_logo: null }); await load(); } catch (e) { alert(errMsg(e)); }
  }
  async function supprimer(b: Bailleur) {
    if (!confirm(`Supprimer « ${b.nom} » de la liste ?${b.nb_operations ? ` Ses ${b.nb_operations} opération(s) de rendez-vous n’afficheront plus son logo.` : ''}`)) return;
    try { await rpc('admin_delete_bailleur', { p_token: token, p_id: b.id }); await load(); } catch (e) { alert(errMsg(e)); }
  }

  if (err) return <div className="notice err">{err}</div>;
  if (!liste) return <div className="muted">Chargement…</div>;
  if (liste.length === 0) return <div className="notice info" style={{ margin: 0 }}>Aucun bailleur enregistré. Ajoutez-en un avec « Bailleur » → « + Nouveau bailleur… ».</div>;
  return (
    <table className="list">
      <tbody>
        {liste.map((b) => (
          <tr key={b.id}>
            <td style={{ width: 150 }}>{b.logo ? <img src={b.logo} alt={b.nom} style={{ height: 36, maxWidth: 140, objectFit: 'contain' }} /> : <span className="muted small">Pas de logo</span>}</td>
            <td style={{ fontWeight: 600 }}>{b.nom}<div className="muted small">{b.nb_operations ?? 0} opération(s)</div></td>
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
              <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                Changer le logo
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => changerLogo(b, e.target.files?.[0])} />
              </label>{' '}
              <button className="btn ghost sm" onClick={() => renommer(b)}>Renommer</button>{' '}
              <button className="btn danger sm" onClick={() => supprimer(b)}>Supprimer</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
