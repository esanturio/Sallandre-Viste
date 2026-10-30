-- ===== Bailleurs (logo réutilisé d'une campagne à l'autre) =====
create table public.bailleurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(trim(nom)) between 1 and 120),
  logo text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  created_at timestamptz not null default now()
);
create unique index bailleurs_nom_unique on public.bailleurs(lower(trim(nom)));
alter table public.bailleurs enable row level security;
revoke all on public.bailleurs from anon, authenticated;

alter table public.operations add column bailleur_id uuid references public.bailleurs(id) on delete set null;

-- ===== Occupants connus à l'avance (import de la liste du bailleur) + nombre d'absences =====
alter table public.lots add column occupant_nom text;
alter table public.lots add column occupant_tel text;
alter table public.lots add column occupant_email text;
alter table public.lots add column absences int not null default 0;
alter table public.lots add constraint lots_occupant_len check (length(coalesce(occupant_nom,'')) <= 120
  and length(coalesce(occupant_tel,'')) <= 30 and length(coalesce(occupant_email,'')) <= 160);

-- ===== Journal de l'activité hebdomadaire =====
create table public.keepalive_log (id bigserial primary key, ran_at timestamptz not null default now(), ok boolean not null);
alter table public.keepalive_log enable row level security;
revoke all on public.keepalive_log from anon, authenticated;
alter table public.app_config add column keepalive_secret text not null default public.new_token();

-- ===== Vue JSON d'une opération =====
create or replace function public._op_json(p_op uuid, p_mode text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'operation', (select jsonb_build_object(
        'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet,
        'consignes', o.consignes, 'contact', o.contact, 'archived', o.archived, 'bailleur_id', o.bailleur_id,
        'bailleur', (select jsonb_build_object('nom', b.nom, 'logo', b.logo) from bailleurs b where b.id = o.bailleur_id))
        || case when p_mode = 'admin' then jsonb_build_object('concierge_token', o.concierge_token, 'tenant_token', o.tenant_token, 'tech_token', o.tech_token) else '{}'::jsonb end
      from operations o where o.id = p_op),
    'batiments', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'ordre', b.ordre) order by b.ordre, b.nom)
      from batiments b where b.operation_id = p_op), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'batiment_id', l.batiment_id, 'etage', l.etage, 'numero', l.numero,
        'reserve', exists(select 1 from reservations r where r.lot_id = l.id))
        || case when p_mode = 'locataire' then '{}'::jsonb else jsonb_build_object(
             'visite', l.visite, 'visite_note', l.visite_note, 'visite_at', l.visite_at, 'absences', l.absences,
             'occupant_nom', l.occupant_nom, 'occupant_tel', l.occupant_tel, 'occupant_email', l.occupant_email) end
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

-- ===== Bailleurs : gestion (admin) =====
create or replace function public.admin_bailleurs(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'logo', b.logo,
      'nb_operations', (select count(*) from operations o where o.bailleur_id = b.id)) order by lower(b.nom)) from bailleurs b), '[]'::jsonb);
end $$;

create or replace function public.admin_save_bailleur(p_token text, p_id uuid, p_nom text, p_logo text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS_BAILLEUR'; end if;
  if p_logo is not null and (p_logo not like 'data:image/%' or length(p_logo) > 400000) then raise exception 'LOGO_INVALIDE'; end if;
  begin
    if p_id is null then
      insert into bailleurs(nom, logo) values (trim(p_nom), p_logo) returning id into v;
    else
      update bailleurs set nom = trim(p_nom), logo = coalesce(p_logo, logo) where id = p_id returning id into v;
      if v is null then raise exception 'BAILLEUR_INTROUVABLE'; end if;
    end if;
  exception when unique_violation then raise exception 'BAILLEUR_EXISTE';
  end;
  return v;
end $$;

create or replace function public.admin_delete_bailleur(p_token text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  delete from bailleurs where id = p_id;
end $$;

create or replace function public.admin_set_bailleur(p_token text, p_op uuid, p_bailleur uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  if p_bailleur is not null and not exists(select 1 from bailleurs where id = p_bailleur) then raise exception 'BAILLEUR_INTROUVABLE'; end if;
  update operations set bailleur_id = p_bailleur where id = p_op;
end $$;

-- Liste des opérations : avec le bailleur
create or replace function public.admin_operations(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet, 'archived', o.archived, 'created_at', o.created_at,
      'bailleur', (select b.nom from bailleurs b where b.id = o.bailleur_id),
      'nb_lots', (select count(*) from lots l where l.operation_id = o.id),
      'nb_vus', (select count(*) from lots l where l.operation_id = o.id and l.visite = 'vu'),
      'nb_reservations', (select count(*) from reservations r where r.operation_id = o.id),
      'nb_creneaux', (select count(*) from creneaux c where c.operation_id = o.id),
      'premier_jour', (select min(jour) from creneaux c where c.operation_id = o.id),
      'dernier_jour', (select max(jour) from creneaux c where c.operation_id = o.id)
    ) order by o.archived, o.created_at desc) from operations o), '[]'::jsonb);
end $$;

-- ===== Import de la liste du bailleur =====
-- p_rows : [{"batiment": "A", "etage": 2, "numero": "21", "nom": "...", "tel": "...", "email": "..."}]
create or replace function public.staff_import_lots(p_token text, p_op uuid, p_rows jsonb, p_batiment_defaut uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; v_by text; x jsonb; v_bat uuid; v_bnom text; v_num text; v_et int; v_lot uuid;
  crees int := 0; maj int := 0; ignores int := 0; bats int := 0; v_seul uuid;
begin
  v := public._staff_op(p_token, p_op);
  v_by := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'IMPORT_VIDE'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception 'IMPORT_TROP_GROS'; end if;

  for x in select * from jsonb_array_elements(p_rows) loop
    v_num := left(trim(coalesce(x->>'numero','')), 40);
    v_et := case when (x->>'etage') ~ '^-?\d{1,3}$' then (x->>'etage')::int else null end;
    if v_num = '' or v_et is null then ignores := ignores + 1; continue; end if;

    -- Bâtiment : par nom (créé s'il n'existe pas), sinon celui par défaut
    v_bnom := left(trim(coalesce(x->>'batiment','')), 80);
    v_bat := null;
    if v_bnom <> '' then
      select id into v_bat from batiments where operation_id = v and lower(trim(nom)) = lower(v_bnom);
      if v_bat is null then
        select b.id into v_seul from batiments b where b.operation_id = v and b.nom = 'Bâtiment unique'
          and (select count(*) from batiments where operation_id = v) = 1
          and not exists(select 1 from lots l where l.batiment_id = b.id);
        if v_seul is not null then
          update batiments set nom = v_bnom where id = v_seul; v_bat := v_seul;
        else
          insert into batiments(operation_id, nom, ordre)
          values (v, v_bnom, coalesce((select max(ordre)+1 from batiments where operation_id = v), 0)) returning id into v_bat;
          bats := bats + 1;
        end if;
      end if;
    else
      select id into v_bat from batiments where id = p_batiment_defaut and operation_id = v;
      if v_bat is null then select id into v_bat from batiments where operation_id = v order by ordre limit 1; end if;
    end if;

    select id into v_lot from lots where batiment_id = v_bat and etage = v_et and lower(trim(numero)) = lower(v_num);
    if v_lot is null then
      insert into lots(operation_id, batiment_id, etage, numero, created_by, occupant_nom, occupant_tel, occupant_email)
      values (v, v_bat, v_et, v_num, v_by,
        nullif(left(trim(coalesce(x->>'nom','')), 120), ''), nullif(left(trim(coalesce(x->>'tel','')), 30), ''), nullif(left(trim(coalesce(x->>'email','')), 160), ''));
      crees := crees + 1;
    else
      update lots set
        occupant_nom = coalesce(nullif(left(trim(coalesce(x->>'nom','')), 120), ''), occupant_nom),
        occupant_tel = coalesce(nullif(left(trim(coalesce(x->>'tel','')), 30), ''), occupant_tel),
        occupant_email = coalesce(nullif(left(trim(coalesce(x->>'email','')), 160), ''), occupant_email)
      where id = v_lot;
      maj := maj + 1;
    end if;
  end loop;
  return jsonb_build_object('crees', crees, 'maj', maj, 'ignores', ignores, 'batiments', bats);
end $$;

-- Modifier les coordonnées connues d'un logement
create or replace function public.staff_set_occupant(p_token text, p_op uuid, p_lot uuid, p_nom text, p_tel text, p_email text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  update lots set occupant_nom = nullif(trim(coalesce(p_nom,'')),''), occupant_tel = nullif(trim(coalesce(p_tel,'')),''),
    occupant_email = nullif(trim(coalesce(p_email,'')),'')
  where id = p_lot and operation_id = v;
  if not found then raise exception 'LOT_INTROUVABLE'; end if;
end $$;

-- ===== Reprogrammation d'un absent =====
-- p_creneau renseigné : le RDV est déplacé sur ce créneau (l'occupant est prévenu par vous)
-- p_creneau nul       : le RDV est libéré, l'occupant peut reprendre un créneau via le lien (ses coordonnées sont conservées sur le logement)
create or replace function public.staff_reprogrammer(p_token text, p_op uuid, p_lot uuid, p_creneau uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; r reservations%rowtype; l lots%rowtype; c creneaux%rowtype; n int;
begin
  v := public._staff_op(p_token, p_op);
  select * into l from lots where id = p_lot and operation_id = v for update;
  if not found then raise exception 'LOT_INTROUVABLE'; end if;
  select * into r from reservations where lot_id = p_lot;

  if p_creneau is not null then
    if r.id is null then raise exception 'PAS_DE_RDV'; end if;
    select * into c from creneaux where id = p_creneau and operation_id = v for update;
    if not found then raise exception 'CRENEAU_INTROUVABLE'; end if;
    if c.batiment_id is not null and c.batiment_id <> l.batiment_id then raise exception 'CRENEAU_AUTRE_BATIMENT'; end if;
    select count(*) into n from reservations where creneau_id = c.id and id <> r.id;
    if n >= c.capacite then raise exception 'CRENEAU_COMPLET'; end if;
    update reservations set creneau_id = c.id where id = r.id;
  elsif r.id is not null then
    update lots set occupant_nom = coalesce(occupant_nom, r.nom),
                    occupant_tel = coalesce(occupant_tel, nullif(r.telephone, '—')),
                    occupant_email = coalesce(occupant_email, r.email)
    where id = p_lot;
    delete from reservations where id = r.id;
  end if;

  update lots set visite = null, visite_at = null, absences = absences + case when l.visite = 'absent' then 1 else 0 end
  where id = p_lot;
end $$;

-- ===== Données personnelles : l'effacement couvre aussi la liste importée =====
create or replace function public.admin_purge_personal(p_token text, p_op uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public._staff_op(p_token, p_op, true);
  update reservations set nom = 'Données effacées', telephone = '—', email = null, commentaire = null where operation_id = p_op;
  get diagnostics n = row_count;
  update lots set visite_note = null, occupant_nom = null, occupant_tel = null, occupant_email = null where operation_id = p_op;
  return n;
end $$;

-- ===== Activité hebdomadaire (appelée par la tâche planifiée Vercel) =====
-- Crée une fausse opération puis la supprime aussitôt ; journalise le passage
create or replace function public.keepalive(p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; reste int;
begin
  if not exists(select 1 from app_config where keepalive_secret = p_secret and coalesce(p_secret,'') <> '') then raise exception 'ACCES_REFUSE'; end if;
  insert into operations(immeuble, adresse, objet, archived) values ('__keepalive__', 'Entrée technique hebdomadaire', 'Maintenance', true) returning id into v;
  insert into batiments(operation_id, nom) values (v, 'Bâtiment unique');
  delete from batiments where operation_id = v;
  delete from operations where id = v;
  select count(*) into reste from operations where immeuble = '__keepalive__';
  insert into keepalive_log(ok) values (reste = 0);
  delete from keepalive_log where ran_at < now() - interval '1 year';
  return jsonb_build_object('ok', reste = 0, 'at', now());
end $$;

revoke execute on all functions in schema public from public;
grant execute on function
  public.admin_bailleurs(text), public.admin_save_bailleur(text, uuid, text, text), public.admin_delete_bailleur(text, uuid),
  public.admin_set_bailleur(text, uuid, uuid), public.admin_operations(text),
  public.staff_import_lots(text, uuid, jsonb, uuid), public.staff_set_occupant(text, uuid, uuid, text, text, text),
  public.staff_reprogrammer(text, uuid, uuid, uuid), public.admin_purge_personal(text, uuid), public.keepalive(text)
to anon, authenticated;
