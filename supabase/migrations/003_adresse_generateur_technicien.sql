-- Adresse = identifiant principal de l'immeuble (nom de résidence facultatif)
alter table public.operations alter column immeuble drop not null;
alter table public.operations add column tech_token text not null unique default public.new_token();

-- Suivi de la visite par le technicien, au niveau du logement (1 logement = 1 visite)
alter table public.lots add column visite text check (visite in ('vu','absent'));
alter table public.lots add column visite_note text;
alter table public.lots add column visite_at timestamptz;

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
        'capacite', c.capacite, 'pris', (select count(*) from reservations r where r.creneau_id = c.id)) order by c.jour, c.debut)
      from creneaux c where c.operation_id = p_op
        and (p_mode <> 'locataire' or (c.jour + c.debut) > public._paris_now())), '[]'::jsonb),
    'reservations', case when p_mode = 'locataire' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'creneau_id', r.creneau_id, 'lot_id', r.lot_id, 'nom', r.nom, 'telephone', r.telephone, 'email', r.email,
        'statut', r.statut, 'commentaire', r.commentaire, 'created_by', r.created_by, 'created_at', r.created_at) order by r.created_at)
      from reservations r where r.operation_id = p_op), '[]'::jsonb) end
  );
$$;

create or replace function public.admin_operations(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin(p_token) then raise exception 'ACCES_REFUSE'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'immeuble', o.immeuble, 'adresse', o.adresse, 'objet', o.objet, 'archived', o.archived, 'created_at', o.created_at,
      'nb_lots', (select count(*) from lots l where l.operation_id = o.id),
      'nb_vus', (select count(*) from lots l where l.operation_id = o.id and l.visite = 'vu'),
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
  if coalesce(trim(p_adresse),'') = '' then raise exception 'ADRESSE_REQUISE'; end if;
  if p_op is null then
    insert into operations(immeuble, adresse, objet, consignes)
    values (nullif(trim(coalesce(p_immeuble,'')),''), trim(p_adresse), coalesce(nullif(trim(coalesce(p_objet,'')),''),'Visite technique'), nullif(trim(coalesce(p_consignes,'')),''))
    returning id into v;
    if p_batiments is not null then
      foreach n in array p_batiments loop
        if trim(n) <> '' then insert into batiments(operation_id, nom, ordre) values (v, trim(n), i); i := i + 1; end if;
      end loop;
    end if;
    if i = 0 then insert into batiments(operation_id, nom, ordre) values (v, 'Bâtiment unique', 0); end if;
  else
    update operations set immeuble = nullif(trim(coalesce(p_immeuble,'')),''), adresse = trim(p_adresse),
      objet = coalesce(nullif(trim(coalesce(p_objet,'')),''),'Visite technique'), consignes = nullif(trim(coalesce(p_consignes,'')),''),
      archived = coalesce(p_archived, false)
    where id = p_op returning id into v;
    if v is null then raise exception 'OPERATION_INTROUVABLE'; end if;
  end if;
  return v;
end $$;

create or replace function public.admin_regen_token(p_token text, p_op uuid, p_kind text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  if p_kind = 'concierge' then update operations set concierge_token = public.new_token() where id = p_op;
  elsif p_kind = 'locataire' then update operations set tenant_token = public.new_token() where id = p_op;
  elsif p_kind = 'tech' then update operations set tech_token = public.new_token() where id = p_op;
  else raise exception 'TYPE_INVALIDE'; end if;
end $$;

-- Génère un bâtiment (ou complète un bâtiment existant) : étages × lots par étage
create or replace function public.staff_generate_lots(p_token text, p_op uuid, p_batiment uuid, p_nom text,
  p_etage_min int, p_etage_max int, p_par_etage int, p_numerotation text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v uuid; v_bat uuid; v_by text; e int; i int; k int; v_num text; n int := 0; c int; v_seul uuid;
begin
  v := public._staff_op(p_token, p_op);
  v_by := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  if p_etage_min is null or p_etage_max is null or p_etage_max < p_etage_min or p_etage_max - p_etage_min > 80 then raise exception 'ETAGES_INVALIDES'; end if;
  if p_par_etage is null or p_par_etage < 1 or p_par_etage > 60 then raise exception 'LOTS_PAR_ETAGE_INVALIDE'; end if;
  if p_numerotation not in ('continue','etage','lettre') then raise exception 'TYPE_INVALIDE'; end if;

  if p_batiment is not null then
    select id into v_bat from batiments where id = p_batiment and operation_id = v;
    if v_bat is null then raise exception 'BATIMENT_INTROUVABLE'; end if;
  else
    if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS'; end if;
    -- Si l'opération n'a que le bâtiment par défaut, vide : on le renomme au lieu d'en créer un second
    select b.id into v_seul from batiments b where b.operation_id = v and b.nom = 'Bâtiment unique'
      and (select count(*) from batiments where operation_id = v) = 1
      and not exists(select 1 from lots l where l.batiment_id = b.id);
    if v_seul is not null then
      update batiments set nom = trim(p_nom) where id = v_seul;
      v_bat := v_seul;
    else
      insert into batiments(operation_id, nom, ordre)
      values (v, trim(p_nom), coalesce((select max(ordre)+1 from batiments where operation_id = v), 0)) returning id into v_bat;
    end if;
  end if;

  select coalesce(max(numero::int), 0) into k from lots where batiment_id = v_bat and numero ~ '^\d{1,6}$';
  for e in p_etage_min..p_etage_max loop
    for i in 1..p_par_etage loop
      if p_numerotation = 'continue' then k := k + 1; v_num := k::text;
      elsif p_numerotation = 'etage' then
        v_num := case when e > 0 then (e*100 + i)::text when e = 0 then lpad(i::text, 2, '0') else 'SS' || (-e) || '-' || i end;
      else v_num := case when i <= 26 then chr(64 + i) else i::text end;
      end if;
      insert into lots(operation_id, batiment_id, etage, numero, created_by) values (v, v_bat, e, v_num, v_by) on conflict do nothing;
      get diagnostics c = row_count; n := n + c;
    end loop;
  end loop;
  return jsonb_build_object('batiment_id', v_bat, 'crees', n);
end $$;

-- ===== Technicien =====
create or replace function public._set_visite(p_op uuid, p_lot uuid, p_statut text, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_statut is not null and p_statut not in ('vu','absent') then raise exception 'STATUT_INVALIDE'; end if;
  update lots set visite = p_statut,
    visite_note = nullif(trim(coalesce(p_note,'')),''),
    visite_at = case when p_statut is null then null else now() end
  where id = p_lot and operation_id = p_op;
  if not found then raise exception 'LOT_INTROUVABLE'; end if;
end $$;

create or replace function public.tech_operation(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from operations where tech_token = p_token and coalesce(p_token,'') <> '';
  if v is null then raise exception 'ACCES_REFUSE'; end if;
  return public._op_json(v, 'tech') || jsonb_build_object('role', 'tech');
end $$;

create or replace function public.tech_set_visite(p_token text, p_lot uuid, p_statut text, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from operations where tech_token = p_token and coalesce(p_token,'') <> '';
  if v is null then raise exception 'ACCES_REFUSE'; end if;
  perform public._set_visite(v, p_lot, p_statut, p_note);
end $$;

create or replace function public.staff_set_visite(p_token text, p_op uuid, p_lot uuid, p_statut text, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  perform public._set_visite(v, p_lot, p_statut, p_note);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.admin_login(text), public.admin_operations(text),
  public.admin_save_operation(text, uuid, text, text, text, text, boolean, text[]),
  public.admin_delete_operation(text, uuid), public.admin_regen_token(text, uuid, text),
  public.admin_save_batiment(text, uuid, uuid, text), public.admin_delete_batiment(text, uuid, uuid),
  public.admin_generate_creneaux(text, uuid, date[], time, time, int, int),
  public.admin_update_creneau(text, uuid, uuid, int), public.admin_delete_creneaux(text, uuid, uuid[]),
  public.staff_operation(text, uuid), public.staff_add_lots(text, uuid, uuid, jsonb),
  public.staff_generate_lots(text, uuid, uuid, text, int, int, int, text),
  public.staff_update_lot(text, uuid, uuid, uuid, int, text), public.staff_delete_lot(text, uuid, uuid),
  public.staff_book(text, uuid, uuid, uuid, uuid, int, text, text, text, text, text, text),
  public.staff_cancel_reservation(text, uuid, uuid), public.staff_move_reservation(text, uuid, uuid, uuid),
  public.staff_set_visite(text, uuid, uuid, text, text),
  public.tenant_operation(text),
  public.tenant_book(text, uuid, uuid, uuid, int, text, text, text, text, text, text),
  public.tech_operation(text), public.tech_set_visite(text, uuid, text, text)
to anon, authenticated;
