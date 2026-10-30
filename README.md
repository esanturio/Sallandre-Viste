# Sallandre · Prise de rendez-vous

Petit outil pour planifier les visites / audits de logements dans un immeuble.
Aucun compte : chaque espace s'ouvre avec un lien secret.

| Espace | Lien | Rôle |
|---|---|---|
| Administration | `/admin/<jeton admin>` | Créer les opérations (immeuble, bâtiments), ouvrir les dates et créneaux, suivre, exporter |
| Gardien | `/c/<jeton gardien>` | Voir le planning et les logements en attente, inscrire / déplacer / annuler des occupants, générer ou compléter les bâtiments et logements, imprimer / envoyer l'affiche QR |
| Occupants | `/r/<jeton occupants>` | Choisir son logement, une date et un créneau, laisser ses coordonnées |
| Technicien | `/t/<jeton technicien>` | Planning du jour, coordonnées, marquer chaque logement « Visité » ou « Absent » avec une note, ajouter un logement manquant ou supprimer un logement saisi par erreur |

L'adresse identifie l'immeuble (suggestions via la Base Adresse Nationale / Géoplateforme IGN, gratuite et sans clé).

Règles : un logement = une visite ; un créneau ne peut pas dépasser sa capacité (contrôlé en base).

## Bailleurs, import, absents

- **Bailleurs** : nom + logo enregistrés une fois, réutilisables d'une campagne à l'autre ; le logo s'affiche à côté de celui de Sallandre (pages, affiche).
- **Import** de la liste du bailleur (Excel .xlsx ou CSV) : colonnes reconnues automatiquement, logements créés ou complétés, coordonnées conservées pour la relance.
- **Absents** : déplacer sur un nouveau créneau ou libérer le RDV (l'occupant reprend un créneau via le lien) ; compteur de passages.

## Activité hebdomadaire

Tâche planifiée Vercel (`vercel.json`, lundi 6h UTC) → `/api/keepalive` → fonction `keepalive` : crée une fausse opération puis la supprime, et journalise le passage dans `keepalive_log`. Variables Vercel : `CRON_SECRET`, `KEEPALIVE_SECRET`.

## Données personnelles

- **Supprimer définitivement** une opération efface tout : rendez-vous (nom, téléphone, e-mail, commentaire), logements et notes de visite, créneaux, coupures, bâtiments. Les liens cessent de fonctionner.
- **Effacer les données personnelles** anonymise les rendez-vous, notes et coordonnées importées d'une opération terminée en gardant les statistiques.
- Aucune donnée n'est stockée dans le navigateur.

## Technique

- Next.js (App Router) hébergé sur Vercel
- Supabase (Postgres, région Paris). Les tables ne sont pas accessibles directement :
  tout passe par des fonctions SQL `SECURITY DEFINER` qui vérifient le jeton (`supabase/migrations`).
- Variables d'environnement facultatives : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` (clé publishable).

```bash
npm install
npm run dev
```

## Second site : avis de coupure d'eau (`coupures/`)

Projet Vercel séparé (dossier racine `coupures`). L'administrateur ouvre `/a/<jeton admin>` :
adresse (suggestions IGN), résidence, bâtiment, bailleur (mêmes logos que l'outil de rendez-vous), dates et horaires,
eau froide / chaude, option « sans utilisation », contact. Deux sorties :
- **Imprimer / PDF** : feuille A4 fidèle au modèle Sallandre ;
- **Envoyer au gardien** : lien `/avis#…` (e-mail, SMS, WhatsApp, partage) qui ouvre l'avis prêt à imprimer.
Le contenu de l'avis est entièrement dans le lien (rien n'est enregistré en base) ; seul le logo du bailleur est lu via `public_bailleur_logo`.
