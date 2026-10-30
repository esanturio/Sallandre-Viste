'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { LinkBox } from './ui';
import { messageInvitation, ouvrirAffiche } from '@/lib/poster';
import { opTitle } from '@/lib/format';
import type { OpData } from '@/lib/types';

/**
 * Lien de réservation des occupants : QR code, affiche A4 à imprimer, envoi (partage, e-mail, SMS, WhatsApp).
 * Utilisé par l'administration et par le gardien.
 */
export default function PosterCard({ data, tenantToken, onRegen }: { data: OpData; tenantToken: string; onRegen?: () => void }) {
  const op = data.operation;
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [bloque, setBloque] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);
  const url = origin ? `${origin}/r/${tenantToken}` : '';
  const msg = url ? messageInvitation(op, url) : '';
  const sujet = `Prise de rendez-vous – ${op.objet} – ${opTitle(op)}`;
  const nomFichier = `qr-rdv-${opTitle(op).replace(/[^\w-]+/g, '_')}.png`;

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 700, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#134575', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  async function partager() {
    try {
      // Sur téléphone : on joint l'image du QR code quand c'est possible
      const blob = await (await fetch(qr)).blob();
      const file = new File([blob], nomFichier, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: sujet, text: msg, files: [file] });
        return;
      }
      await navigator.share({ title: sujet, text: msg, url });
    } catch {
      /* partage annulé par l'utilisateur */
    }
  }

  function imprimer() {
    setBloque(false);
    if (!ouvrirAffiche({ op, batiments: data.batiments, coupures: data.coupures ?? [], url, qr, origin })) setBloque(true);
  }

  return (
    <div className="card">
      <h2>Affiche et lien de réservation</h2>
      <p className="hint">
        À imprimer et afficher dans le hall : les occupants scannent le QR code et prennent rendez-vous sans créer de compte.
        Vous pouvez aussi envoyer le lien directement.
      </p>

      <div className="qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr} alt="QR code de réservation" /> : <div style={{ width: 160, height: 160 }} />}
        <div className="btns" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 230 }}>
          <button className="btn" onClick={imprimer} disabled={!qr}>🖨 Imprimer l’affiche A4</button>
          {canShare && <button className="btn ghost" onClick={partager} disabled={!qr}>📤 Envoyer / partager</button>}
          {qr && <a className="btn ghost sm" href={qr} download={nomFichier}>Télécharger le QR code (image)</a>}
        </div>
      </div>
      {bloque && <div className="notice warn" style={{ marginTop: 12 }}>Votre navigateur a bloqué la fenêtre de l’affiche. Autorisez les fenêtres pop-up pour ce site puis réessayez.</div>}

      <div className="spacer" />
      <div className="lbl">Lien de réservation</div>
      <LinkBox url={url} />
      <div className="btns" style={{ marginTop: 10 }}>
        <a className="btn ghost sm" href={`mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(msg)}`}>✉️ Par e-mail</a>
        <a className="btn ghost sm" href={`sms:?&body=${encodeURIComponent(msg)}`}>💬 Par SMS</a>
        <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Astuce : dans la fenêtre d’impression, choisissez « Enregistrer en PDF » pour obtenir l’affiche en fichier et l’envoyer par e-mail.
      </p>

      {op.archived && <div className="notice warn" style={{ marginTop: 14, marginBottom: 0 }}>Opération archivée : le lien de réservation est désactivé.</div>}
      {onRegen && (
        <>
          <div className="spacer" />
          <button className="linkbtn small" onClick={onRegen}>Créer un nouveau lien (désactive l’ancien et les affiches déjà imprimées)</button>
        </>
      )}
    </div>
  );
}
