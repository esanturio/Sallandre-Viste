create extension if not exists pgcrypto with schema extensions;

create or replace function public.new_token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_');
$$;

create table public.app_config (
  id int primary key default 1 check (id = 1),
  admin_token text not null default public.new_token()
);
insert into public.app_config (id) values (1);

-- Une "opération" = un immeuble + une campagne de visites
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  immeuble text not null,
  adresse text,
  objet text not null default 'Visite technique',
  consignes text,
  archived boolean not null default false,
  concierge_token text not null unique default public.new_token(),
  tenant_token text not null unique default public.new_token(),
  created_at timestamptz not null default now()
);

create table public.batiments (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  nom text not null,
  ordre int not null default 0
);
create index on public.batiments(operation_id);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  batiment_id uuid not null references public.batiments(id) on delete cascade,
  etage smallint not null,            -- 0 = RDC, négatif = sous-sol
  numero text not null,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);
create unique index lots_unique on public.lots(batiment_id, etage, lower(trim(numero)));
create index on public.lots(operation_id);

-- Heures locales (Europe/Paris)
create table public.creneaux (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  jour date not null,
  debut time not null,
  fin time not null,
  capacite int not null default 1 check (capacite >= 1),
  check (fin > debut)
);
create unique index creneaux_unique on public.creneaux(operation_id, jour, debut);

-- Un logement = une visite (lot_id unique)
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  creneau_id uuid not null references public.creneaux(id) on delete restrict,
  lot_id uuid not null unique references public.lots(id) on delete cascade,
  nom text not null,
  telephone text not null,
  email text,
  statut text not null check (statut in ('locataire','proprietaire','autre')),
  commentaire text,
  created_by text not null check (created_by in ('locataire','concierge','admin')),
  created_at timestamptz not null default now()
);
create index on public.reservations(creneau_id);
create index on public.reservations(operation_id);

alter table public.app_config enable row level security;
alter table public.operations enable row level security;
alter table public.batiments enable row level security;
alter table public.lots enable row level security;
alter table public.creneaux enable row level security;
alter table public.reservations enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.new_token() from public, anon, authenticated;
