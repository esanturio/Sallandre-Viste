/** Lecture et interprétation de la liste d'occupants fournie par le bailleur (Excel .xlsx ou CSV) */

export type Champ = 'batiment' | 'etage' | 'numero' | 'nom' | 'prenom' | 'tel' | 'email';
export type Mapping = Record<Champ, number>; // index de colonne, -1 = absente
export type LigneImport = { batiment: string; etage: number | null; numero: string; nom: string; tel: string; email: string };

export const CHAMPS: { k: Champ; label: string; requis?: boolean }[] = [
  { k: 'numero', label: 'Lot / logement', requis: true },
  { k: 'etage', label: 'Étage' },
  { k: 'batiment', label: 'Bâtiment / escalier' },
  { k: 'nom', label: 'Nom' },
  { k: 'prenom', label: 'Prénom' },
  { k: 'tel', label: 'Téléphone' },
  { k: 'email', label: 'E-mail' },
];

const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

const MOTS: Record<Champ, RegExp> = {
  numero: /^(n )?(lot|logement|appartement|appart|appt|porte|numero|num|n|no|ref|reference|n lot|n logement|n appartement)( .*)?$/,
  etage: /^(etage|etg|niveau|niv)( .*)?$/,
  batiment: /^(batiment|bat|bat |escalier|esc|cage|immeuble|entree)( .*)?$/,
  nom: /^(nom|locataire|occupant|resident|nom du locataire|nom locataire|nom prenom|nom et prenom|titulaire)( .*)?$/,
  prenom: /^prenom( .*)?$/,
  tel: /^(tel|telephone|portable|mobile|gsm|tel portable|tel mobile|numero de telephone|n tel|phone)( .*)?$/,
  email: /^(e ?mail|mail|courriel|adresse mail|adresse e mail)( .*)?$/,
};

/** Lit un fichier .xlsx ou .csv et renvoie un tableau de lignes (cellules en texte) */
export async function lireFichier(file: File): Promise<string[][]> {
  const nom = file.name.toLowerCase();
  if (nom.endsWith('.xls') && !nom.endsWith('.xlsx')) {
    throw new Error('Format .xls (ancien Excel) non pris en charge : ouvrez le fichier dans Excel et enregistrez-le en .xlsx ou en .csv.');
  }
  if (nom.endsWith('.csv') || nom.endsWith('.txt') || file.type === 'text/csv') {
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf); // CSV Excel français
    return parseCsv(txt.replace(/^﻿/, ''));
  }
  const { readSheet } = await import('read-excel-file/browser');
  const data = await readSheet(file);
  return data.map((row) => row.map((c) => (c == null ? '' : c instanceof Date ? c.toLocaleDateString('fr-FR') : String(c))));
}

export function parseCsv(txt: string): string[][] {
  const premiere = txt.split(/\r?\n/)[0] ?? '';
  const sep = [';', ',', '\t'].sort((a, b) => premiere.split(b).length - premiere.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) {
      if (ch === '"' && txt[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Trouve la ligne d'en-tête (parmi les 15 premières) et devine les colonnes */
export function devinerColonnes(rows: string[][]): { entete: number; mapping: Mapping } {
  let best = { entete: 0, score: -1, mapping: vide() };
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const m = vide();
    let score = 0;
    rows[r].forEach((cell, i) => {
      const n = norm(cell);
      if (!n) return;
      for (const c of ['email', 'tel', 'prenom', 'etage', 'batiment', 'numero', 'nom'] as Champ[]) {
        if (m[c] === -1 && MOTS[c].test(n)) { m[c] = i; score++; break; }
      }
    });
    if (score > best.score) best = { entete: r, score, mapping: m };
  }
  return { entete: best.entete, mapping: best.mapping };
}

function vide(): Mapping {
  return { batiment: -1, etage: -1, numero: -1, nom: -1, prenom: -1, tel: -1, email: -1 };
}

/** « RDC », « Rez-de-chaussée », « 0 », « R+3 », « 3e », « 3ème étage », « SS1 », « -1 »… → nombre */
export function lireEtage(v: string): number | null {
  const n = norm(v);
  if (!n) return null;
  if (/^(rdc|rez|rez de chaussee|rez de chausse|r 0|r0|0)$/.test(n) || n.startsWith('rez')) return 0;
  let m = n.match(/^(ss|sous sol|s sol|sous-sol)\s*(\d{1,2})?$/);
  if (m) return -(m[2] ? parseInt(m[2], 10) : 1);
  m = n.match(/^-\s*(\d{1,2})$/) || v.trim().match(/^-\s*(\d{1,2})$/);
  if (m) return -parseInt(m[1], 10);
  m = n.match(/^r\s*\+?\s*(\d{1,2})$/) || v.trim().toLowerCase().match(/^r\s*\+\s*(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^(\d{1,2})\s*(e|er|ere|eme|em|ieme|nd|nde)?(\s*etage)?$/);
  if (m) return parseInt(m[1], 10);
  m = n.match(/^etage\s*(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Étage déduit d'un numéro de lot type 302 → 3, 1205 → 12 (si pas de colonne étage) */
export function etageDepuisNumero(num: string): number | null {
  const d = num.replace(/\D/g, '');
  if (d.length === 3) return parseInt(d[0], 10);
  if (d.length === 4) return parseInt(d.slice(0, 2), 10);
  return null;
}

export function construireLignes(rows: string[][], entete: number, m: Mapping, opts: { etageDepuisNumero: boolean; etageDefaut: number }): LigneImport[] {
  const get = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  return rows.slice(entete + 1).map((r) => {
    const numero = get(r, m.numero).replace(/\.0+$/, '');
    let etage = m.etage >= 0 ? lireEtage(get(r, m.etage)) : null;
    if (etage === null && m.etage < 0) etage = opts.etageDepuisNumero ? etageDepuisNumero(numero) ?? opts.etageDefaut : opts.etageDefaut;
    const nom = [get(r, m.prenom), get(r, m.nom)].filter(Boolean).join(' ');
    return { batiment: get(r, m.batiment), etage, numero, nom, tel: telFr(get(r, m.tel)), email: get(r, m.email) };
  }).filter((l) => l.numero !== '');
}

/** Excel supprime souvent le 0 initial : 612345678 → 0612345678 */
function telFr(v: string): string {
  const t = v.replace(/\.0+$/, '').trim();
  return /^[1-9]\d{8}$/.test(t) ? '0' + t : t;
}
