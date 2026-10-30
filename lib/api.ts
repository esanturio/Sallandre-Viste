import { createClient } from '@supabase/supabase-js';

// Clé publique (publishable) : sans danger côté navigateur.
// Toutes les données passent par des fonctions qui vérifient le lien d'accès.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xjspshcmgpllaebtmmmm.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_WJCeSrXk7QGtAYNJ4mVS7w_-HbnkuP2';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MESSAGES: Record<string, string> = {
  ACCES_REFUSE: "Ce lien d'accès n'est pas valide ou a été renouvelé.",
  LIEN_INVALIDE: "Ce lien n'est plus valide. Rapprochez-vous de votre gardien ou du gestionnaire.",
  NOM_REQUIS: 'Merci d’indiquer votre nom.',
  TELEPHONE_INVALIDE: 'Merci d’indiquer un numéro de téléphone valide.',
  STATUT_INVALIDE: 'Merci d’indiquer si vous êtes locataire ou propriétaire.',
  CRENEAU_INTROUVABLE: 'Ce créneau n’existe plus. Merci d’en choisir un autre.',
  CRENEAU_PASSE: 'Ce créneau est déjà passé. Merci d’en choisir un autre.',
  CRENEAU_COMPLET: 'Ce créneau vient d’être pris par quelqu’un d’autre. Merci d’en choisir un autre.',
  LOT_INTROUVABLE: 'Ce logement est introuvable.',
  LOT_REQUIS: 'Merci de préciser votre logement (étage et numéro).',
  LOT_DEJA_RESERVE: 'Ce logement a déjà un rendez-vous. Pour le modifier, contactez le gardien.',
  LOTS_AVEC_RDV: 'Impossible de retirer autant de logements : certains ont un rendez-vous ou ont déjà été visités.',
  NOM_REQUIS_BAT: 'Merci de donner un nom au bâtiment.',
  LOT_EXISTE_DEJA: 'Ce logement existe déjà à cet étage.',
  BATIMENT_INTROUVABLE: 'Bâtiment introuvable.',
  BATIMENT_A_DES_RESERVATIONS: 'Impossible : des rendez-vous existent dans ce bâtiment.',
  DERNIER_BATIMENT: 'Il faut garder au moins un bâtiment.',
  ADRESSE_REQUISE: 'Merci d’indiquer l’adresse de l’immeuble.',
  ETAGES_INVALIDES: 'Vérifiez les étages (le dernier doit être au-dessus du premier).',
  LOTS_PAR_ETAGE_INVALIDE: 'Nombre de lots par étage invalide (1 à 60).',
  IMMEUBLE_REQUIS: 'Merci d’indiquer le nom de l’immeuble.',
  OPERATION_INTROUVABLE: 'Opération introuvable.',
  DUREE_INVALIDE: 'Durée de créneau invalide (5 minutes minimum).',
  HORAIRES_INVALIDES: 'L’heure de fin doit être après l’heure de début.',
  CAPACITE_TROP_BASSE: 'Il y a déjà plus de rendez-vous que cette capacité.',
  CRENEAU_A_DES_RESERVATIONS: 'Impossible : un ou plusieurs de ces créneaux ont des rendez-vous. Déplacez-les ou annulez-les d’abord.',
  TYPE_INVALIDE: 'Action invalide.',
};

export class AppError extends Error {
  code: string;
  constructor(code: string) {
    super(MESSAGES[code] || 'Une erreur est survenue. Merci de réessayer.');
    this.code = code;
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await sb.rpc(fn, args);
  } catch {
    throw new AppError('RESEAU');
  }
  if (res.error) {
    const code = (res.error.message || '').trim();
    if (!MESSAGES[code]) console.error(fn, res.error);
    throw new AppError(code);
  }
  return res.data as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof AppError) return e.code === 'RESEAU' ? 'Connexion impossible. Vérifiez votre réseau et réessayez.' : e.message;
  return 'Une erreur est survenue. Merci de réessayer.';
}
