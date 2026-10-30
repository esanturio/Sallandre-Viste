'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import type { StaffCtx } from './StaffPage';
import { rpc } from '@/lib/api';
import { opSub, opTitle } from '@/lib/format';
import AddressInput from './AddressInput';
import { coupureCible } from './Coupures';
import { heure, jourLong } from '@/lib/format';

function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="linkbox">
      <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button className="btn ghost sm" onClick={async () => {
        try { await navigator.clipboard.writeText(url); } catch { prompt('Copiez ce lien :', url); }
        setCopied(true); setTimeout(() => setCopied(false), 1500);
      }}>{copied ? 'Copié ✓' : 'Copier'}</button>
      <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">Ouvrir</a>
    </div>
  );
}

export default function AccessPanel({ ctx }: { ctx: StaffCtx }) {
  const { data, token, opId, act } = ctx;
  const op = data.operation;
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState('');
  const titre = opTitle(op);
  const sousTitre = opSub(op);
  const [f, setF] = useState({ immeuble: op.immeuble ?? '', adresse: op.adresse ?? '', objet: op.objet, consignes: op.consignes ?? '' });

  useEffect(() => setOrigin(window.location.origin), []);
  const tenantUrl = origin ? `${origin}/r/${op.tenant_token}` : '';
  const conciergeUrl = origin ? `${origin}/c/${op.concierge_token}` : '';
  const techUrl = origin ? `${origin}/t/${op.tech_token}` : '';

  useEffect(() => {
    if (!tenantUrl) return;
    QRCode.toDataURL(tenantUrl, { width: 600, margin: 1, color: { dark: '#134575', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [tenantUrl]);

  function affiche() {
    const w = window.open('', '_blank');
    if (!w) return;
    const futures = (data.coupures ?? []).filter((k) => k.jour >= new Date().toISOString().slice(0, 10));
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const coupuresHtml = futures.length
      ? `<div class="eau"><b>💧 Coupures d’eau prévues</b><ul>${futures.map((k) => `<li>${esc(jourLong(k.jour))} de ${heure(k.debut)} à ${heure(k.fin)}${coupureCible(k, data.batiments) ? ' — ' + esc(coupureCible(k, data.batiments)) : ''}</li>`).join('')}</ul></div>`
      : '';
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche – ${esc(titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:16mm}body{font-family:Montserrat,Arial,sans-serif;color:#1d2733;text-align:center;margin:0}
.logo{width:220px;margin:10px auto 26px;display:block}h1{color:#134575;font-size:34px;margin:0 0 8px}h2{font-weight:500;font-size:20px;margin:0 0 28px;color:#5d6875}
.box{border:3px solid #134575;border-radius:18px;padding:28px;margin:0 auto;max-width:540px}.qr{width:300px;height:300px}
p{font-size:18px;line-height:1.5}.url{font-size:13px;color:#5d6875;word-break:break-all}.c{white-space:pre-wrap;font-size:15px;color:#5d6875;margin-top:24px}.eau{margin:22px auto 0;max-width:540px;text-align:left;background:#e7f2fb;color:#0b4f7a;border-radius:12px;padding:14px 18px;font-size:16px}.eau ul{margin:6px 0 0;padding-left:20px}</style></head>
<body><img class="logo" src="${origin}/logo-sallandre.png"><h1>${esc(op.objet)}</h1><h2>${esc(titre)}${sousTitre ? '<br>' + esc(sousTitre) : ''}</h2>
<div class="box"><p><b>Prenez rendez-vous en 1 minute</b><br>Scannez ce QR code avec l’appareil photo de votre téléphone<br>et choisissez le créneau qui vous convient.</p>
<img class="qr" src="${qr}"><p class="url">${esc(tenantUrl)}</p><p style="font-size:15px">Aucun compte à créer. En cas de difficulté, adressez-vous à votre gardien.</p></div>
${op.consignes ? `<div class="c">${esc(op.consignes)}</div>` : ''}
${coupuresHtml}
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);
    w.document.close();
  }

  const regen = (kind: 'concierge' | 'locataire' | 'tech') =>
    confirm(kind === 'locataire'
      ? 'Créer un nouveau lien pour les occupants ? L’ancien lien et l’ancien QR code ne fonctionneront plus (les affiches devront être réimprimées).'
      : `Créer un nouveau lien ${kind === 'tech' ? 'technicien' : 'gardien'} ? L’ancien lien ne fonctionnera plus.`) &&
    act(() => rpc('admin_regen_token', { p_token: token, p_op: opId, p_kind: kind }), 'Nouveau lien créé');

  return (
    <>
      <div className="card">
        <h2>Lien pour les occupants</h2>
        <p className="hint">À envoyer aux locataires et propriétaires, ou à afficher dans le hall avec le QR code. Ils réservent sans créer de compte.</p>
        <LinkBox url={tenantUrl} />
        <div className="spacer" />
        <div className="qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code de réservation" />}
          <div className="btns" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <button className="btn" onClick={affiche} disabled={!qr}>Imprimer une affiche A4</button>
            {qr && <a className="btn ghost sm" href={qr} download={`qr-${titre.replace(/[^\w-]+/g, '_')}.png`}>Télécharger le QR code</a>}
            <button className="linkbtn small" onClick={() => regen('locataire')}>Créer un nouveau lien (désactive l’ancien)</button>
          </div>
        </div>
        {op.archived && <div className="notice warn" style={{ marginTop: 14, marginBottom: 0 }}>Opération archivée : le lien occupants est désactivé.</div>}
      </div>

      <div className="card">
        <h2>Lien pour le gardien</h2>
        <p className="hint">Le gardien voit le planning, les coordonnées, les logements en attente, et peut inscrire ou déplacer des occupants. Il ne peut pas modifier les créneaux.</p>
        <LinkBox url={conciergeUrl} />
        <div className="spacer" />
        <button className="linkbtn small" onClick={() => regen('concierge')}>Créer un nouveau lien (désactive l’ancien)</button>
      </div>

      <div className="card">
        <h2>Lien pour le technicien</h2>
        <p className="hint">Sur son téléphone : le planning du jour, les coordonnées et les consignes, et pour chaque logement un bouton « Visité » ou « Absent » avec une note. Vous et le gardien voyez l’avancement en direct.</p>
        <LinkBox url={techUrl} />
        <div className="spacer" />
        <button className="linkbtn small" onClick={() => regen('tech')}>Créer un nouveau lien (désactive l’ancien)</button>
      </div>

      <div className="card">
        <h2>Informations de l’opération</h2>
        <div className="row">
          <div className="field"><label>Nom de la résidence <span className="opt">(facultatif)</span></label><input type="text" value={f.immeuble} onChange={(e) => setF({ ...f, immeuble: e.target.value })} /></div>
          <div className="field"><label>Objet de la visite</label><input type="text" value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} /></div>
        </div>
        <div className="field"><label>Adresse de l’immeuble</label><AddressInput value={f.adresse} onChange={(v) => setF({ ...f, adresse: v })} /></div>
        <div className="field">
          <label>Consignes pour les occupants <span className="opt">(affichées sur la page de réservation)</span></label>
          <textarea value={f.consignes} onChange={(e) => setF({ ...f, consignes: e.target.value })} placeholder="ex. Merci de dégager l’accès sous l’évier et à la salle de bains." />
        </div>
        <button className="btn" onClick={() => act(() => rpc('admin_save_operation', {
          p_token: token, p_op: opId, p_immeuble: f.immeuble, p_adresse: f.adresse, p_objet: f.objet, p_consignes: f.consignes, p_archived: op.archived, p_batiments: null,
        }), 'Enregistré')}>Enregistrer</button>
      </div>

      <div className="card">
        <h2>Archiver ou supprimer</h2>
        <p className="hint">Archiver désactive le lien occupants mais conserve tout. Supprimer efface définitivement l’opération et tous ses rendez-vous.</p>
        <div className="btns">
          <button className="btn ghost" onClick={() => act(() => rpc('admin_save_operation', {
            p_token: token, p_op: opId, p_immeuble: op.immeuble, p_adresse: op.adresse, p_objet: op.objet, p_consignes: op.consignes, p_archived: !op.archived, p_batiments: null,
          }), op.archived ? 'Opération réactivée' : 'Opération archivée')}>{op.archived ? 'Réactiver' : 'Archiver'}</button>
          <button className="btn danger" onClick={async () => {
            const v = prompt(`Pour confirmer la suppression définitive, tapez SUPPRIMER :`);
            if (v?.trim().toUpperCase() !== 'SUPPRIMER') return;
            if (await act(() => rpc('admin_delete_operation', { p_token: token, p_op: opId }))) router.push(`/admin/${token}`);
          }}>Supprimer définitivement</button>
        </div>
      </div>
    </>
  );
}
