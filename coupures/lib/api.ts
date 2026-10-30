import { createClient } from '@supabase/supabase-js';

// Même base que l'outil de prise de rendez-vous (bailleurs et logos partagés).
// Clé publique (publishable) : sans danger côté navigateur, tout passe par des fonctions qui vérifient l'accès.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xjspshcmgpllaebtmmmm.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_WJCeSrXk7QGtAYNJ4mVS7w_-HbnkuP2';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const MESSAGES: Record<string, string> = {
  ACCES_REFUSE: "Ce lien d'accès n'est pas valide.",
  NOM_REQUIS_BAILLEUR: 'Merci d’indiquer le nom du bailleur.',
  LOGO_INVALIDE: 'Ce logo n’est pas valide ou est trop lourd. Essayez une image PNG ou JPG plus petite.',
  BAILLEUR_EXISTE: 'Un bailleur porte déjà ce nom.',
  BAILLEUR_INTROUVABLE: 'Bailleur introuvable.',
  TEXTE_TROP_LONG: 'Un des champs est trop long.',
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
  try { res = await sb.rpc(fn, args); } catch { throw new AppError('RESEAU'); }
  if (res.error) {
    let code = (res.error.message || '').trim();
    if (res.error.code === '23514') code = 'TEXTE_TROP_LONG';
    throw new AppError(code);
  }
  return res.data as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof AppError) return e.code === 'RESEAU' ? 'Connexion impossible. Vérifiez votre réseau et réessayez.' : e.message;
  return 'Une erreur est survenue. Merci de réessayer.';
}

export type Bailleur = { id: string; nom: string; logo: string | null; nb_operations?: number };
export type Logo = { nom: string; logo: string | null };

/** Logo d'un bailleur à partir de son identifiant (page du gardien, sans accès administrateur) */
export async function logoBailleur(id: string): Promise<Logo | null> {
  if (!id) return null;
  try { return await rpc<Logo | null>('public_bailleur_logo', { p_id: id }); } catch { return null; }
}
