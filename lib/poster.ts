import { heure, jourLong, opSub, opTitle, parisToday } from './format';
import type { Batiment, Coupure, Operation } from './types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function cible(k: Coupure, batiments: Batiment[]): string {
  if (!k.batiment_id) return batiments.length > 1 ? 'Tout l’immeuble' : '';
  return batiments.find((b) => b.id === k.batiment_id)?.nom ?? '';
}

/** Ouvre l'affiche A4 (QR code + infos) dans un nouvel onglet et lance l'impression. */
export function ouvrirAffiche(opts: {
  op: Operation; batiments: Batiment[]; coupures: Coupure[]; url: string; qr: string; origin: string;
}): boolean {
  const { op, batiments, coupures, url, qr, origin } = opts;
  const w = window.open('', '_blank');
  if (!w) return false;
  const titre = opTitle(op);
  const sous = opSub(op);
  const futures = coupures.filter((k) => k.jour >= parisToday());
  const coupuresHtml = futures.length
    ? `<div class="eau"><b>💧 Coupures d’eau prévues</b><ul>${futures
        .map((k) => `<li>${esc(jourLong(k.jour))} de ${heure(k.debut)} à ${heure(k.fin)}${cible(k, batiments) ? ' — ' + esc(cible(k, batiments)) : ''}</li>`)
        .join('')}</ul></div>`
    : '';
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche – ${esc(titre)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:Montserrat,Arial,sans-serif;color:#1d2733;text-align:center;margin:0;padding:16px}
.logo{width:170px;margin:0 auto 16px;display:block}
.objet{display:block;background:#134575;color:#fff;font-weight:800;font-size:40px;line-height:1.15;letter-spacing:.02em;text-transform:uppercase;padding:18px 22px;border-radius:16px;margin:0 auto 18px;max-width:640px}
h1{color:#134575;font-size:24px;margin:0 0 4px}
h2{font-weight:500;font-size:17px;margin:0 0 20px;color:#5d6875}
.box{border:3px solid #134575;border-radius:18px;padding:24px;margin:0 auto;max-width:520px}
.qr{width:270px;height:270px}
p{font-size:18px;line-height:1.45;margin:0 0 12px}
.url{font-size:12px;color:#5d6875;word-break:break-all;margin-top:8px}
.c{white-space:pre-wrap;font-size:15px;color:#5d6875;margin:20px auto 0;max-width:520px}
.eau{margin:18px auto 0;max-width:520px;text-align:left;background:#e7f2fb;color:#0b4f7a;border-radius:12px;padding:12px 18px;font-size:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.eau ul{margin:6px 0 0;padding-left:20px}
.foot{margin-top:22px;font-size:12px;color:#8a95a3}
.bar{margin:0 auto 18px;display:flex;gap:8px;justify-content:center}
.bar button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 18px;background:#134575;color:#fff;cursor:pointer}
@media print{.bar{display:none}body{padding:0}.objet{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>
<img class="logo" src="${origin}/logo-sallandre.png" alt="Sallandre">
<div class="objet">${esc(op.objet)}</div>
<h1>${esc(titre)}</h1>
${sous ? `<h2>${esc(sous)}</h2>` : '<div style="height:20px"></div>'}
<div class="box">
<p><b>Prenez rendez-vous en 1 minute</b></p>
<p>Scannez ce QR code avec l’appareil photo<br>de votre téléphone et choisissez votre créneau.</p>
<img class="qr" src="${qr}" alt="QR code">
<div class="url">${esc(url)}</div>
<p style="font-size:15px;margin:14px 0 0">Aucun compte à créer.<br>En cas de difficulté, adressez-vous à votre gardien.</p>
</div>
${op.consignes ? `<div class="c">${esc(op.consignes)}</div>` : ''}
${coupuresHtml}
<div class="foot">Sallandre × BatiBig</div>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>
</body></html>`);
  w.document.close();
  return true;
}

/** Texte prêt à envoyer aux occupants */
export function messageInvitation(op: Operation, url: string): string {
  return `Bonjour,\n\nUne ${op.objet.toLowerCase()} est prévue dans votre logement (${opTitle(op)}).\nMerci de choisir votre créneau en 1 minute, sans créer de compte :\n${url}\n\nCordialement`;
}
