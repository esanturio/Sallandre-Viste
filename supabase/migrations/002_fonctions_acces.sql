-- Toutes les lectures/écritures passent par ces fonctions (SECURITY DEFINER).
-- Les tables ne sont jamais accessibles directement à la clé publique.

-- ===== Helpers internes =====
create or replace function public._is_admin(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_config where admin_token = p_token and coalesce(p_token,'') <> '');
$$;

-- Opération accessible au personnel (admin : p_op requis ; concierge : déduit du jeton)
create or replace function public._staff_op(p_token text, p_op uuid, p_admin_only boolean default false)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if public._is_admin(p_token) then
    select id into v from operations where id = p_op;
  elsif not p_admin_only then
    select id into v from operations where concierge_token = p_token and (p_op is null or id = p_op);
  end if;
  if v is null then raise exception 'ACCES_REFUSE'; end if;
  return v;
end $$;

create or replace function public._paris_now() returns timestamp
language sql stable set search_path = public as $$ select (now() at time zone 'Europe/Paris'); $$;

create or replace function public._op_json(p_op uuid, p_mode text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'operation', (select jsonb_build_object(
        'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet,
        'consignes', o.consignes, 'archived', o.archived)
        || case when p_mode = 'admin' then jsonb_build_object('concierge_token', o.concierge_token, 'tenant_token', o.tenant_token) else '{}'::jsonb end
      from operations o where o.id = p_op),
    'batiments', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'ordre', b.ordre) order by b.ordre, b.nom)
      from batiments b where b.operation_id = p_op), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'batiment_id', l.batiment_id, 'etage', l.etage, 'numero', l.numero,
        'reserve', exists(select 1 from reservations r where r.lot_id = l.id)) order by l.etage, l.numero)
      from lots l where l.operation_id = p_op), '[]'::jsonb),
    'creneaux', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'jour', c.jour, 'debut', to_char(c.debut,'HH24:MI'), 'fin', to_char(c.fin,'HH24:MI'),
        'capacite', c.capacite, 'pris', (select count(*) from reservations r where r.creneau_id = c.id)) order by c.jour, c.debut)
      from creneaux c where c.operation_id = p_op
        and (p_mode <> 'locataire' or (c.jour + c.debut) > public._paris_now())), '[]'::jsonb),
    'reservations', case when p_mode = 'locataire' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'creneau_id', r.creneau_id, 'lot_id', r.lot_id, 'nom', r.nom, 'telephone', r.telephone, 'email', r.email,
        'statut', r.statut, 'commentaire', r.commentaire, 'created_by', r.created_by, 'created_at', r.created_at) order by r.created_at)
      from reservations r where r.operation_id = p_op), '[]'::jsonb) end
  );
$$;

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
    select id into v_lot from lots where batiment_id = p_batiment and etage = p_etage and lower(trim(numero)) = lower(trim(p_numero));
    if v_lot is null then
      insert into lots(operation_id, batiment_id, etage, numero, created_by)
      values (p_op, p_batiment, p_etage, trim(p_numero), p_by) returning id into v_lot;
    end if;
  end if;

  if exists(select 1 from reservations where lot_id = v_lot) then raise exception 'LOT_DEJA_RESERVE'; end if;
  select count(*) into v_pris from reservations where creneau_id = c.id;
  if v_pris >= c.capacite then raise exception 'CRENEAU_COMPLET'; end if;

  begin
    insert into reservations(operation_id, creneau_id, lot_id, nom, telephone, email, statut, commentaire, created_by)
    values (p_op, c.id, v_lot, trim(p_nom), trim(p_tel), nullif(trim(coalesce(p_email,'')),''), p_statut, nullif(trim(coalesce(p_comm,'')),''), p_by)
    returning id into v_res;
  exception when unique_violation then raise exception 'LOT_DEJA_RESERVE';
  end;

  select * into l from lots where id = v_lot;
  select nom into v_bat from batiments where id = l.batiment_id;
  return jsonb_build_object('reservation_id', v_res, 'jour', c.jour, 'debut', to_char(c.debut,'HH24:MI'), 'fin', to_char(c.fin,'HH24:MI'),
    'batiment', v_bat, 'etage', l.etage, 'numero', l.numero, 'nom', trim(p_nom));
end $$;

-- ===== Admin =====
create or replace function public.admin_login(p_token text) returns boolean
language sql stable security definer set search_path = public as $$ select public._is_admin(p_token); $$;

create or replace function public.admin_operations(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet, 'archived', o.archived, 'created_at', o.created_at,
      'nb_lots', (select count(*) from lots l where l.operation_id = o.id),
      'nb_reservations', (select count(*) from reservations r where r.operation_id = o.id),
      'nb_creneaux', (select count(*) from creneaux c where c.operation_id = o.id),
      'premier_jour', (select min(jour) from creneaux c where c.operation_id = o.id),
      'dernier_jour', (select max(jour) from creneaux c where c.operation_id = o.id)
    ) order by o.archived, o.created_at desc) from operations o), '[]'::jsonb);
end $$;

create or replace function public.admin_save_operation(p_token text, p_op uuid, p_immeuble text, p_adresse text, p_objet text,
  p_consignes text, p_archived boolean, p_batiments text[] default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v uuid; i int := 0; n text;
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  if coalesce(trim(p_immeuble),'') = '' then raise exception 'IMMEUBLE_REQUIS'; end if;
  if p_op is null then
    insert into operations(immeuble, adresse, objet, consignes)
    values (trim(p_immeuble), nullif(trim(coalesce(p_adresse,'')),''), coalesce(nullif(trim(coalesce(p_objet,'')),''),'Visite technique'), nullif(trim(coalesce(p_consignes,'')),''))
    returning id into v;
    if p_batiments is not null then
      foreach n in array p_batiments loop
        if trim(n) <> '' then insert into batiments(operation_id, nom, ordre) values (v, trim(n), i); i := i + 1; end if;
      end loop;
    end if;
    if i = 0 then insert into batiments(operation_id, nom, ordre) values (v, 'Bâtiment unique', 0); end if;
  else
    update operations set immeuble = trim(p_immeuble), adresse = nullif(trim(coalesce(p_adresse,'')),''),
      objet = coalesce(nullif(trim(coalesce(p_objet,'')),''),'Visite technique'), consignes = nullif(trim(coalesce(p_consignes,'')),''),
      archived = coalesce(p_archived, false)
    where id = p_op returning id into v;
    if v is null then raise exception 'OPERATION_INTROUVABLE'; end if;
  end if;
  return v;
end $$;

create or replace function public.admin_delete_operation(p_token text, p_op uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  delete from reservations where operation_id = p_op;
  delete from operations where id = p_op;
end $$;

create or replace function public.admin_regen_token(p_token text, p_op uuid, p_kind text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  if p_kind = 'concierge' then update operations set concierge_token = public.new_token() where id = p_op;
  elsif p_kind = 'locataire' then update operations set tenant_token = public.new_token() where id = p_op;
  else raise exception 'TYPE_INVALIDE'; end if;
end $$;

create or replace function public.admin_save_batiment(p_token text, p_op uuid, p_id uuid, p_nom text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  perform public._staff_op(p_token, p_op, true);
  if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS'; end if;
  if p_id is null then
    insert into batiments(operation_id, nom, ordre)
    values (p_op, trim(p_nom), coalesce((select max(ordre)+1 from batiments where operation_id = p_op), 0)) returning id into v;
  else
    update batiments set nom = trim(p_nom) where id = p_id and operation_id = p_op returning id into v;
  end if;
  return v;
end $$;

create or replace function public.admin_delete_batiment(p_token text, p_op uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  if exists(select 1 from reservations r join lots l on l.id = r.lot_id where l.batiment_id = p_id) then raise exception 'BATIMENT_A_DES_RESERVATIONS'; end if;
  if (select count(*) from batiments where operation_id = p_op) <= 1 then raise exception 'DERNIER_BATIMENT'; end if;
  delete from batiments where id = p_id and operation_id = p_op;
end $$;

create or replace function public.admin_generate_creneaux(p_token text, p_op uuid, p_jours date[], p_debut time, p_fin time, p_duree int, p_capacite int)
returns int language plpgsql volatile security definer set search_path = public as $$
declare d date; t time; t2 time; n int := 0; k int;
begin
  perform public._staff_op(p_token, p_op, true);
  if p_duree is null or p_duree < 5 then raise exception 'DUREE_INVALIDE'; end if;
  if p_fin <= p_debut then raise exception 'HORAIRES_INVALIDES'; end if;
  foreach d in array p_jours loop
    t := p_debut;
    loop
      t2 := t + make_interval(mins => p_duree);
      exit when t2 > p_fin or t2 <= t;
      insert into creneaux(operation_id, jour, debut, fin, capacite)
      values (p_op, d, t, t2, greatest(coalesce(p_capacite,1),1))
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
      t := t2;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.admin_update_creneau(p_token text, p_op uuid, p_id uuid, p_capacite int) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  if p_capacite < (select count(*) from reservations where creneau_id = p_id) then raise exception 'CAPACITE_TROP_BASSE'; end if;
  update creneaux set capacite = greatest(p_capacite,1) where id = p_id and operation_id = p_op;
end $$;

create or replace function public.admin_delete_creneaux(p_token text, p_op uuid, p_ids uuid[]) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public._staff_op(p_token, p_op, true);
  if exists(select 1 from reservations where creneau_id = any(p_ids)) then raise exception 'CRENEAU_A_DES_RESERVATIONS'; end if;
  delete from creneaux where id = any(p_ids) and operation_id = p_op;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== Personnel (admin + concierge) =====
create or replace function public.staff_operation(p_token text, p_op uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid; v_role text;
begin
  v := public._staff_op(p_token, p_op);
  v_role := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  return public._op_json(v, v_role) || jsonb_build_object('role', v_role);
end $$;

create or replace function public.staff_add_lots(p_token text, p_op uuid, p_batiment uuid, p_lots jsonb) returns int
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; x jsonb; n int := 0; k int; v_by text;
begin
  v := public._staff_op(p_token, p_op);
  v_by := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  for x in select * from jsonb_array_elements(p_lots) loop
    if coalesce(trim(x->>'numero'),'') <> '' and (x->>'etage') is not null then
      insert into lots(operation_id, batiment_id, etage, numero, created_by)
      values (v, p_batiment, (x->>'etage')::smallint, trim(x->>'numero'), v_by)
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.staff_update_lot(p_token text, p_op uuid, p_lot uuid, p_batiment uuid, p_etage int, p_numero text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  if coalesce(trim(p_numero),'') = '' then raise exception 'LOT_REQUIS'; end if;
  begin
    update lots set batiment_id = p_batiment, etage = p_etage, numero = trim(p_numero) where id = p_lot and operation_id = v;
  exception when unique_violation then raise exception 'LOT_EXISTE_DEJA';
  end;
end $$;

create or replace function public.staff_delete_lot(p_token text, p_op uuid, p_lot uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  if exists(select 1 from reservations where lot_id = p_lot) then raise exception 'LOT_DEJA_RESERVE'; end if;
  delete from lots where id = p_lot and operation_id = v;
end $$;

create or replace function public.staff_book(p_token text, p_op uuid, p_creneau uuid, p_lot uuid, p_batiment uuid, p_etage int, p_numero text,
  p_nom text, p_tel text, p_email text, p_statut text, p_comm text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  return public._book(v, p_creneau, p_lot, p_batiment, p_etage, p_numero, p_nom, p_tel, p_email, p_statut, p_comm,
    case when public._is_admin(p_token) then 'admin' else 'concierge' end, false);
end $$;

create or replace function public.staff_cancel_reservation(p_token text, p_op uuid, p_res uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  delete from reservations where id = p_res and operation_id = v;
end $$;

create or replace function public.staff_move_reservation(p_token text, p_op uuid, p_res uuid, p_creneau uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; c creneaux%rowtype; n int;
begin
  v := public._staff_op(p_token, p_op);
  select * into c from creneaux where id = p_creneau and operation_id = v for update;
  if not found then raise exception 'CRENEAU_INTROUVABLE'; end if;
  select count(*) into n from reservations where creneau_id = c.id and id <> p_res;
  if n >= c.capacite then raise exception 'CRENEAU_COMPLET'; end if;
  update reservations set creneau_id = c.id where id = p_res and operation_id = v;
end $$;

-- ===== Locataires / propriétaires =====
create or replace function public.tenant_operation(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from operations where tenant_token = p_token and coalesce(p_token,'') <> '' and not archived;
  if v is null then raise exception 'LIEN_INVALIDE'; end if;
  return public._op_json(v, 'locataire');
end $$;

create or replace function public.tenant_book(p_token text, p_creneau uuid, p_lot uuid, p_batiment uuid, p_etage int, p_numero text,
  p_nom text, p_tel text, p_email text, p_statut text, p_comm text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from operations where tenant_token = p_token and coalesce(p_token,'') <> '' and not archived;
  if v is null then raise exception 'LIEN_INVALIDE'; end if;
  return public._book(v, p_creneau, p_lot, p_batiment, p_etage, p_numero, p_nom, p_tel, p_email, p_statut, p_comm, 'locataire', true);
end $$;

-- ===== Droits =====
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.admin_login(text), public.admin_operations(text),
  public.admin_save_operation(text, uuid, text, text, text, text, boolean, text[]),
  public.admin_delete_operation(text, uuid), public.admin_regen_token(text, uuid, text),
  public.admin_save_batiment(text, uuid, uuid, text), public.admin_delete_batiment(text, uuid, uuid),
  public.admin_generate_creneaux(text, uuid, date[], time, time, int, int),
  public.admin_update_creneau(text, uuid, uuid, int), public.admin_delete_creneaux(text, uuid, uuid[]),
  public.staff_operation(text, uuid), public.staff_add_lots(text, uuid, uuid, jsonb),
  public.staff_update_lot(text, uuid, uuid, uuid, int, text), public.staff_delete_lot(text, uuid, uuid),
  public.staff_book(text, uuid, uuid, uuid, uuid, int, text, text, text, text, text, text),
  public.staff_cancel_reservation(text, uuid, uuid), public.staff_move_reservation(text, uuid, uuid, uuid),
  public.tenant_operation(text),
  public.tenant_book(text, uuid, uuid, uuid, int, text, text, text, text, text, text)
to anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
