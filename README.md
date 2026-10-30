# Sallandre · Prise de rendez-vous

Petit outil pour planifier les visites / audits de logements dans un immeuble.
Aucun compte : chaque espace s'ouvre avec un lien secret.

| Espace | Lien | Rôle |
|---|---|---|
| Administration | `/admin/<jeton admin>` | Créer les opérations (immeuble, bâtiments), ouvrir les dates et créneaux, suivre, exporter |
| Gardien | `/c/<jeton gardien>` | Voir le planning et les logements en attente, inscrire / déplacer / annuler des occupants, compléter la liste des logements |
| Occupants | `/r/<jeton occupants>` | Choisir son logement, une date et un créneau, laisser ses coordonnées |

Règles : un logement = une visite ; un créneau ne peut pas dépasser sa capacité (contrôlé en base).

## Technique

- Next.js (App Router) hébergé sur Vercel
- Supabase (Postgres, région Paris). Les tables ne sont pas accessibles directement :
  tout passe par des fonctions SQL `SECURITY DEFINER` qui vérifient le jeton (`supabase/migrations`).
- Variables d'environnement facultatives : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` (clé publishable).

```bash
npm install
npm run dev
```
