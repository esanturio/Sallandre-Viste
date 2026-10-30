/** Données d'un avis de coupure d'eau. Tout tient dans le lien : aucune base de données. */

export type Plage = { jour: string; debut: string; fin: string };

export type Eau = 'froide' | 'chaude' | 'froide_chaude';

export type Avis = {
  ville: string;          // « Bagneux »
  emis: string;           // date de l'avis (AAAA-MM-JJ)
  adresse: string;
  residence: string;      // nom de résidence (facultatif)
  batiment: string;       // bâtiment / escalier concerné (facultatif)
  eau: Eau;
  motif: string;          // « travaux de plomberie »
  plages: Plage[];
  sansUtilisation: boolean;
  texteSansUtilisation: string;
  chasse: boolean;        // ne pas tirer la chasse (travaux sur les évacuations)
  texteChasse: string;
  contact: string;        // facultatif
  bailleur: string;       // identifiant du bailleur (logo), facultatif
};

export const EAU_LABEL: Record<Eau, string> = {
  froide: 'eau froide',
  chaude: 'eau chaude',
  froide_chaude: 'eau froide et eau chaude',
};

export const TEXTE_CHASSE_DEFAUT =
  'IMPORTANT : ne tirez pas la chasse d’eau et ne videz aucune eau (évier, lavabo, douche) pendant toute la durée des travaux. Nos techniciens interviennent sur les canalisations d’évacuation : tout ce qui est évacué se déverserait directement sur eux.';

export const TEXTE_SANS_UTILISATION_DEFAUT =
  'Veuillez ne pas utiliser les wc / douches / baignoires / lavabos / éviers / machine à laver & lave-linge car nous remplaçons la canalisation d’évacuation générale des eaux usées & des eaux vannes de l’immeuble.';

export function aujourdhui(): string {
  const p = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // AAAA-MM-JJ
}

export function avisVide(): Avis {
  return {
    ville: 'Bagneux',
    emis: aujourdhui(),
    adresse: '',
    residence: '',
    batiment: '',
    eau: 'froide',
    motif: 'travaux de plomberie',
    plages: [{ jour: '', debut: '09:00', fin: '12:00' }],
    sansUtilisation: false,
    texteSansUtilisation: TEXTE_SANS_UTILISATION_DEFAUT,
    chasse: false,
    texteChasse: TEXTE_CHASSE_DEFAUT,
    contact: '',
    bailleur: '',
  };
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function parseJour(j: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** « 30 octobre 2026 » */
export function dateSimple(j: string): string {
  const d = parseJour(j);
  return d ? `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
}

/** « Mardi 4 novembre 2026 » */
export function dateLongue(j: string): string {
  const d = parseJour(j);
  if (!d) return '';
  const s = `${JOURS[d.getUTCDay()]} ${dateSimple(j)}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 9h », « 13h30 » */
export function heure(h: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  if (!m) return '';
  return `${parseInt(m[1], 10)}h${m[2] === '00' ? '' : m[2]}`;
}

export function plageTexte(p: Plage): string {
  const j = dateLongue(p.jour);
  if (!j) return '';
  if (p.debut && p.fin) return `${j} de ${heure(p.debut)} à ${heure(p.fin)}`;
  if (p.debut) return `${j} à partir de ${heure(p.debut)}`;
  return j;
}

export function plagesValides(a: Avis): Plage[] {
  return a.plages.filter((p) => parseJour(p.jour)).sort((x, y) => `${x.jour}${x.debut}`.localeCompare(`${y.jour}${y.debut}`));
}

/** Titre « IMMEUBLE – … » : la résidence si elle est renseignée, sinon l'adresse */
export function titreImmeuble(a: Avis): string {
  return a.residence.trim() || a.adresse.trim();
}

/** Ce qui manque pour pouvoir diffuser l'avis */
export function manques(a: Avis): string[] {
  const m: string[] = [];
  if (!a.adresse.trim()) m.push('l’adresse');
  if (plagesValides(a).length === 0) m.push('au moins une date de coupure');
  if (a.plages.some((p) => p.jour && p.debut && p.fin && p.fin <= p.debut)) m.push('des horaires cohérents (fin après le début)');
  return m;
}

/* ===== Lien partageable ===== */

const CLES: [keyof Avis, string][] = [
  ['ville', 'v'], ['emis', 'e'], ['adresse', 'a'], ['residence', 'r'], ['batiment', 'b'], ['eau', 'w'],
  ['motif', 'm'], ['plages', 'p'], ['sansUtilisation', 's'], ['texteSansUtilisation', 't'], ['chasse', 'f'], ['texteChasse', 'g'], ['contact', 'c'], ['bailleur', 'l'],
];

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encoderAvis(a: Avis): string {
  const o: Record<string, unknown> = {};
  const def = avisVide();
  for (const [k, c] of CLES) {
    if (k === 'texteChasse' && (!a.chasse || a.texteChasse === def.texteChasse)) continue;
    if (k === 'texteSansUtilisation' && (!a.sansUtilisation || a.texteSansUtilisation === def.texteSansUtilisation)) continue;
    if (k === 'plages') { o[c] = plagesValides(a).map((p) => [p.jour, p.debut, p.fin]); continue; }
    const v = a[k];
    if (v === '' || v === false) continue;
    o[c] = v;
  }
  return b64urlEncode(JSON.stringify(o));
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');
const hh = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');

export function decoderAvis(code: string): Avis | null {
  try {
    const o = JSON.parse(b64urlDecode(code)) as Record<string, unknown>;
    const def = avisVide();
    const plages: Plage[] = Array.isArray(o.p)
      ? (o.p as unknown[]).slice(0, 20).map((x) => {
          const t = Array.isArray(x) ? x : [];
          return { jour: typeof t[0] === 'string' && parseJour(t[0]) ? t[0] : '', debut: hh(t[1]), fin: hh(t[2]) };
        }).filter((p) => p.jour)
      : [];
    const eau = (['froide', 'chaude', 'froide_chaude'] as const).includes(o.w as Eau) ? (o.w as Eau) : 'froide';
    const a: Avis = {
      ville: str(o.v, 80),
      emis: typeof o.e === 'string' && parseJour(o.e) ? o.e : '',
      adresse: str(o.a, 200),
      residence: str(o.r, 120),
      batiment: str(o.b, 120),
      eau,
      motif: str(o.m, 200) || def.motif,
      plages,
      sansUtilisation: o.s === true,
      texteSansUtilisation: str(o.t, 1000) || def.texteSansUtilisation,
      chasse: o.f === true,
      texteChasse: str(o.g, 1000) || def.texteChasse,
      contact: str(o.c, 200),
      bailleur: typeof o.l === 'string' && /^[0-9a-f-]{36}$/i.test(o.l) ? o.l : '',
    };
    return a.adresse || plages.length ? a : null;
  } catch {
    return null;
  }
}

export function lienAvis(origin: string, a: Avis): string {
  return `${origin}/avis#${encoderAvis(a)}`;
}

/** Message d'accompagnement pour le gardien */
export function messageGardien(a: Avis, url: string): string {
  const pl = plagesValides(a).map((p) => `• ${plageTexte(p)}`).join('\n');
  return `Bonjour,\n\nVoici l’avis de coupure d’eau pour l’immeuble ${titreImmeuble(a)}${a.residence && a.adresse ? ` (${a.adresse})` : ''}${a.batiment ? ` – ${a.batiment}` : ''} :\n${pl}\n\nMerci de l’imprimer et de l’afficher dans le hall :\n${url}\n\nCordialement,\nSallandre`;
}

export function nomFichier(a: Avis): string {
  const p = plagesValides(a)[0];
  return `Avis coupure d'eau - ${titreImmeuble(a).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)}${p ? ` - ${p.jour}` : ''}`;
}
