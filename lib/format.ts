import type { Batiment, Creneau, Lot, Numerotation } from './types';

export function etageLabel(e: number): string {
  if (e === 0) return 'RDC';
  if (e < 0) return `Sous-sol ${-e}`;
  if (e === 1) return '1er étage';
  return `${e}e étage`;
}

export const ETAGES_POSSIBLES = Array.from({ length: 44 }, (_, i) => i - 3); // -3 .. 40

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function jourLong(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
}

export function jourCourt(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return cap(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
}

export function heure(h: string): string {
  return h.replace(':', 'h');
}

/** "2026-10-30 09:12" à l'heure de Paris */
export function parisNow(): string {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

export function parisToday(): string {
  return parisNow().slice(0, 10);
}

export function isFuture(c: Creneau, now = parisNow()): boolean {
  return `${c.jour} ${c.debut}` > now;
}

export function lotLabel(lot: Lot, batiments: Batiment[], withBat = batiments.length > 1): string {
  const b = batiments.find((x) => x.id === lot.batiment_id);
  const parts = [] as string[];
  if (withBat && b) parts.push(b.nom);
  parts.push(etageLabel(lot.etage));
  parts.push(`Lot ${lot.numero}`);
  return parts.join(' · ');
}

export function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}

export function sortLots(lots: Lot[], batiments: Batiment[]): Lot[] {
  const ord = new Map(batiments.map((b) => [b.id, b.ordre]));
  return [...lots].sort(
    (a, b) =>
      (ord.get(a.batiment_id) ?? 0) - (ord.get(b.batiment_id) ?? 0) ||
      a.etage - b.etage ||
      a.numero.localeCompare(b.numero, 'fr', { numeric: true }),
  );
}

export const STATUT_LABEL: Record<string, string> = {
  locataire: 'Locataire',
  proprietaire: 'Propriétaire',
  autre: 'Autre',
};

export const ORIGINE_LABEL: Record<string, string> = {
  locataire: 'en ligne',
  concierge: 'par le gardien',
  admin: 'par Sallandre',
};

/** "1-12, 14, A, B" → ["1",...,"12","14","A","B"] */
export function parseNumeros(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*[-à]\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (b >= a && b - a <= 200) for (let i = a; i <= b; i++) out.push(String(i));
      else out.push(s);
    } else out.push(s);
  }
  return Array.from(new Set(out));
}

/** Titre affiché d'une opération : nom de résidence s'il existe, sinon l'adresse */
export function opTitle(o: { immeuble: string | null; adresse: string | null }): string {
  return o.immeuble || o.adresse || 'Immeuble';
}
/** Sous-titre : l'adresse, seulement si un nom de résidence est affiché en titre */
export function opSub(o: { immeuble: string | null; adresse: string | null }): string | null {
  return o.immeuble ? o.adresse : null;
}
export function mapsUrl(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

/** Même logique que la base (staff_generate_lots), pour l'aperçu */
export function numeroGenere(mode: Numerotation, etage: number, i: number, k: number): string {
  if (mode === 'continue') return String(k);
  if (mode === 'etage') return etage > 0 ? String(etage * 100 + i) : etage === 0 ? String(i).padStart(2, '0') : `SS${-etage}-${i}`;
  return i <= 26 ? String.fromCharCode(64 + i) : String(i);
}

export const NUMEROTATIONS: { v: Numerotation; label: string }[] = [
  { v: 'etage', label: 'Par étage (01, 02… 101, 102… 201…)' },
  { v: 'continue', label: 'Continue (1, 2, 3, 4…)' },
  { v: 'lettre', label: 'Lettres à chaque étage (A, B, C…)' },
];
