-- Coupures d'eau : par bâtiment (batiment_id) ou pour tout l'immeuble (batiment_id null)
create table public.coupures (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  batiment_id uuid references public.batiments(id) on delete cascade,
  jour date not null,
  debut time not null,
  fin time not null,
  check (fin > debut)
);
create index on public.coupures(operation_id);
alter table public.coupures enable row level security;
revoke all on public.coupures from anon, authenticated;

-- Un créneau peut être réservé aux logements d'un bâtiment (visites pendant la coupure)
alter table public.creneaux add column batiment_id uuid references public.batiments(id) on delete cascade;
drop index if exists public.creneaux_unique;
create unique index creneaux_unique on public.creneaux(operation_id, coalesce(batiment_id, '00000000-0000-0000-0000-000000000000'::uuid), jour, debut);

create or replace function public._op_json(p_op uuid, p_mode text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'operation', (select jsonb_build_object(
        'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet,
        'consignes', o.consignes, 'archived', o.archived)
        || case when p_mode = 'admin' then jsonb_build_object('concierge_token', o.concierge_token, 'tenant_token', o.tenant_token, 'tech_token', o.tech_token) else '{}'::jsonb end
      from operations o where o.id = p_op),
    'batiments', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'ordre', b.ordre) order by b.ordre, b.nom)
      from batiments b where b.operation_id = p_op), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'batiment_id', l.batiment_id, 'etage', l.etage, 'numero', l.numero,
        'reserve', exists(select 1 from reservations r where r.lot_id = l.id))
        || case when p_mode = 'locataire' then '{}'::jsonb else jsonb_build_object('visite', l.visite, 'visite_note', l.visite_note, 'visite_at', l.visite_at) end
        order by l.etage, l.numero)
      from lots l where l.operation_id = p_op), '[]'::jsonb),
    'creneaux', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'jour', c.jour, 'debut', to_char(c.debut,'HH24:MI'), 'fin', to_char(c.fin,'HH24:MI'),
        'capacite', c.capacite, 'batiment_id', c.batiment_id,
        'pris', (select count(*) from reservations r where r.creneau_id = c.id)) order by c.jour, c.debut)
      from creneaux c where c.operation_id = p_op
        and (p_mode <> 'locataire' or (c.jour + c.debut) > public._paris_now())), '[]'::jsonb),
    'coupures', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'batiment_id', k.batiment_id, 'jour', k.jour,
        'debut', to_char(k.debut,'HH24:MI'), 'fin', to_char(k.fin,'HH24:MI')) order by k.jour, k.debut)
      from coupures k where k.operation_id = p_op
        and (p_mode <> 'locataire' or (k.jour + k.fin) > public._paris_now())), '[]'::jsonb),
    'reservations', case when p_mode = 'locataire' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'creneau_id', r.creneau_id, 'lot_id', r.lot_id, 'nom', r.nom, 'telephone', r.telephone, 'email', r.email,
        'statut', r.statut, 'commentaire', r.commentaire, 'created_by', r.created_by, 'created_at', r.created_at) order by r.created_at)
      from reservations r where r.operation_id = p_op), '[]'::jsonb) end
  );
$$;

-- Réservation : un créneau lié à un bâtiment n'accepte que les logements de ce bâtiment
create or replace function public._book(p_op uuid, p_creneau uuid, p_lot uuid, p_batiment uuid, p_etage int, p_numero text,
  p_nom text, p_tel text, p_email text, p_statut text, p_comm text, p_by text, p_future_only boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c creneaux%rowtype; v_lot uuid; v_pris int; v_res uuid; l lots%rowtype; v_bat text;
begin
  if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS'; end if;
  if length(regexp_replace(coalesce(p_tel,''), '[^0-9]', '', 'g')) < 8 then raise exception 'TELEPHONE_INVALIDE'; end if;
  if p_statut not in ('locataire','proprietaire','autre') then raise exception 'STATUT_INVALIDE'; end if;

  select * into c from creneaux where id = p_creneau and operation_id = p_op for update;
  if not found then raise exception 'CRENEAU_INTROUVABLE'; end if;
  if p_future_only and (c.jour + c.debut) <= public._paris_now() then raise exception 'CRENEAU_PASSE'; end if;

  if p_lot is not null then
    select id into v_lot from lots where id = p_lot and operation_id = p_op;
    if v_lot is null then raise exception 'LOT_INTROUVABLE'; end if;
  else
    if coalesce(trim(p_numero),'') = '' or p_etage is null then raise exception 'LOT_REQUIS'; end if;
    if not exists(select 1 from batiments where id = p_batiment and operation_id = p_op) then raise exception 'BATIMENT_INTROUVABLE'; end if;
    if c.batiment_id is not null and c.batiment_id <> p_batiment then raise exception 'CRENEAU_AUTRE_BATIMENT'; end if;
    select id into v_lot from lots where batiment_id = p_batiment and etage = p_etage and lower(trim(numero)) = lower(trim(p_numero));
    if v_lot is null then
      insert into lots(operation_id, batiment_id, etage, numero, created_by)
      values (p_op, p_batiment, p_etage, trim(p_numero), p_by) returning id into v_lot;
    end if;
  end if;

  select * into l from lots where id = v_lot;
  if c.batiment_id is not null and c.batiment_id <> l.batiment_id then raise exception 'CRENEAU_AUTRE_BATIMENT'; end if;
  if exists(select 1 from reservations where lot_id = v_lot) then raise exception 'LOT_DEJA_RESERVE'; end if;
  select count(*) into v_pris from reservations where creneau_id = c.id;
  if v_pris >= c.capacite then raise exception 'CRENEAU_COMPLET'; end if;

  begin
    insert into reservations(operation_id, creneau_id, lot_id, nom, telephone, email, statut, commentaire, created_by)
    values (p_op, c.id, v_lot, trim(p_nom), trim(p_tel), nullif(trim(coalesce(p_email,'')),''), p_statut, nullif(trim(coalesce(p_comm,'')),''), p_by)
    returning id into v_res;
  exception when unique_violation then raise exception 'LOT_DEJA_RESERVE';
  end;

  select nom into v_bat from batiments where id = l.batiment_id;
  return jsonb_build_object('reservation_id', v_res, 'jour', c.jour, 'debut', to_char(c.debut,'HH24:MI'), 'fin', to_char(c.fin,'HH24:MI'),
    'batiment', v_bat, 'batiment_id', l.batiment_id, 'etage', l.etage, 'numero', l.numero, 'nom', trim(p_nom));
end $$;

-- Déplacement : même contrôle de bâtiment
create or replace function public.staff_move_reservation(p_token text, p_op uuid, p_res uuid, p_creneau uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; c creneaux%rowtype; n int; v_bat uuid;
begin
  v := public._staff_op(p_token, p_op);
  select * into c from creneaux where id = p_creneau and operation_id = v for update;
  if not found then raise exception 'CRENEAU_INTROUVABLE'; end if;
  select l.batiment_id into v_bat from reservations r join lots l on l.id = r.lot_id where r.id = p_res;
  if c.batiment_id is not null and c.batiment_id <> v_bat then raise exception 'CRENEAU_AUTRE_BATIMENT'; end if;
  select count(*) into n from reservations where creneau_id = c.id and id <> p_res;
  if n >= c.capacite then raise exception 'CRENEAU_COMPLET'; end if;
  update reservations set creneau_id = c.id where id = p_res and operation_id = v;
end $$;

-- Génération de créneaux, éventuellement réservés à un bâtiment
create or replace function public.admin_generate_creneaux(p_token text, p_op uuid, p_jours date[], p_debut time, p_fin time, p_duree int, p_capacite int, p_batiment uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare d date; t time; t2 time; n int := 0; k int;
begin
  perform public._staff_op(p_token, p_op, true);
  if p_duree is null or p_duree < 5 then raise exception 'DUREE_INVALIDE'; end if;
  if p_fin <= p_debut then raise exception 'HORAIRES_INVALIDES'; end if;
  if p_batiment is not null and not exists(select 1 from batiments where id = p_batiment and operation_id = p_op) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  foreach d in array p_jours loop
    t := p_debut;
    loop
      t2 := t + make_interval(mins => p_duree);
      exit when t2 > p_fin or t2 <= t;
      insert into creneaux(operation_id, jour, debut, fin, capacite, batiment_id)
      values (p_op, d, t, t2, greatest(coalesce(p_capacite,1),1), p_batiment)
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
      t := t2;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.admin_save_coupure(p_token text, p_op uuid, p_batiment uuid, p_jour date, p_debut time, p_fin time)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  perform public._staff_op(p_token, p_op, true);
  if p_jour is null or p_debut is null or p_fin is null or p_fin <= p_debut then raise exception 'HORAIRES_INVALIDES'; end if;
  if p_batiment is not null and not exists(select 1 from batiments where id = p_batiment and operation_id = p_op) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  insert into coupures(operation_id, batiment_id, jour, debut, fin) values (p_op, p_batiment, p_jour, p_debut, p_fin) returning id into v;
  return v;
end $$;

create or replace function public.admin_delete_coupure(p_token text, p_op uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  delete from coupures where id = p_id and operation_id = p_op;
end $$;

revoke execute on function public.admin_generate_creneaux(text, uuid, date[], time, time, int, int, uuid) from public;
revoke execute on function public.admin_save_coupure(text, uuid, uuid, date, time, time) from public;
revoke execute on function public.admin_delete_coupure(text, uuid, uuid) from public;
grant execute on function
  public.admin_generate_creneaux(text, uuid, date[], time, time, int, int, uuid),
  public.admin_save_coupure(text, uuid, uuid, date, time, time),
  public.admin_delete_coupure(text, uuid, uuid)
to anon, authenticated;
-- Ancienne signature (sans bâtiment) conservée pour compatibilité
create or replace function public.admin_generate_creneaux(p_token text, p_op uuid, p_jours date[], p_debut time, p_fin time, p_duree int, p_capacite int)
returns int language sql volatile security definer set search_path = public as $$
  select public.admin_generate_creneaux(p_token, p_op, p_jours, p_debut, p_fin, p_duree, p_capacite, null::uuid);
$$;
