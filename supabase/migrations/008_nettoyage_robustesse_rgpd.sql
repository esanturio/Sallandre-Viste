-- 1) Fonctions qui ne sont plus appelées par l'application : on les retire (moins de surface exposée)
drop function if exists public.admin_login(text);
drop function if exists public.admin_save_batiment(text, uuid, uuid, text);
drop function if exists public.admin_delete_batiment(text, uuid, uuid);
drop function if exists public.staff_generate_lots(text, uuid, uuid, text, int, int, int, text);
drop function if exists public.staff_rename_batiment(text, uuid, uuid, text);
drop function if exists public.admin_generate_creneaux(text, uuid, date[], time, time, int, int);

-- 2) Longueurs maximales contrôlées en base (en plus des limites des formulaires)
alter table public.operations
  add constraint operations_len check (length(coalesce(immeuble,'')) <= 160 and length(coalesce(adresse,'')) <= 250
    and length(objet) <= 120 and length(coalesce(consignes,'')) <= 2000);
alter table public.batiments add constraint batiments_len check (length(nom) <= 80);
alter table public.lots add constraint lots_len check (length(numero) <= 40 and length(coalesce(visite_note,'')) <= 1000);
alter table public.reservations
  add constraint reservations_len check (length(nom) <= 120 and length(telephone) <= 30
    and length(coalesce(email,'')) <= 160 and length(coalesce(commentaire,'')) <= 1000);

-- 3) Nom de bâtiment manquant : message dédié
create or replace function public.staff_generate_lots_detail(p_token text, p_op uuid, p_batiment uuid, p_nom text,
  p_etages jsonb, p_numerotation text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v uuid; v_bat uuid; v_by text; x jsonb; e int; nb int; i int; k int; v_num text; n int := 0; c int; v_seul uuid; v_total int := 0;
begin
  v := public._staff_op(p_token, p_op);
  v_by := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  if p_numerotation not in ('continue','etage','lettre') then raise exception 'TYPE_INVALIDE'; end if;
  if jsonb_typeof(p_etages) <> 'array' or jsonb_array_length(p_etages) = 0 or jsonb_array_length(p_etages) > 90 then raise exception 'ETAGES_INVALIDES'; end if;
  for x in select * from jsonb_array_elements(p_etages) loop
    nb := (x->>'nb')::int;
    if (x->>'etage') is null or nb is null or nb < 0 or nb > 60 then raise exception 'LOTS_PAR_ETAGE_INVALIDE'; end if;
    v_total := v_total + nb;
  end loop;
  if v_total = 0 then raise exception 'LOTS_PAR_ETAGE_INVALIDE'; end if;

  if p_batiment is not null then
    select id into v_bat from batiments where id = p_batiment and operation_id = v;
    if v_bat is null then raise exception 'BATIMENT_INTROUVABLE'; end if;
  else
    if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS_BAT'; end if;
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
  for x in select value from jsonb_array_elements(p_etages) order by (value->>'etage')::int loop
    e := (x->>'etage')::int; nb := (x->>'nb')::int;
    for i in 1..nb loop
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

-- 4) Un logement qui a un RDV sur un créneau réservé à son bâtiment ne peut pas changer de bâtiment
create or replace function public.staff_update_lot(p_token text, p_op uuid, p_lot uuid, p_batiment uuid, p_etage int, p_numero text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  if coalesce(trim(p_numero),'') = '' then raise exception 'LOT_REQUIS'; end if;
  if exists(select 1 from reservations r join creneaux c on c.id = r.creneau_id
            where r.lot_id = p_lot and c.batiment_id is not null and c.batiment_id <> p_batiment) then
    raise exception 'CRENEAU_AUTRE_BATIMENT';
  end if;
  begin
    update lots set batiment_id = p_batiment, etage = p_etage, numero = trim(p_numero) where id = p_lot and operation_id = v;
    if not found then raise exception 'LOT_INTROUVABLE'; end if;
  exception when unique_violation then raise exception 'LOT_EXISTE_DEJA';
  end;
end $$;

-- 5) Le gardien reçoit aussi le lien occupants (pour imprimer / envoyer l'affiche QR)
create or replace function public.staff_operation(p_token text, p_op uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid; v_role text;
begin
  v := public._staff_op(p_token, p_op);
  v_role := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  return public._op_json(v, v_role)
    || jsonb_build_object('role', v_role)
    || case when v_role = 'concierge'
         then jsonb_build_object('tenant_token', (select tenant_token from operations where id = v))
         else '{}'::jsonb end;
end $$;

-- 6) Données personnelles
-- Suppression d'une opération : tout part (RDV, logements, notes, créneaux, coupures, bâtiments, liens)
create or replace function public.admin_delete_operation(p_token text, p_op uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  delete from reservations where operation_id = p_op;
  delete from coupures where operation_id = p_op;
  delete from lots where operation_id = p_op;
  delete from creneaux where operation_id = p_op;
  delete from batiments where operation_id = p_op;
  delete from operations where id = p_op;
end $$;

-- Effacement des coordonnées sans supprimer l'opération (campagne terminée, on garde les statistiques)
create or replace function public.admin_purge_personal(p_token text, p_op uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public._staff_op(p_token, p_op, true);
  update reservations set nom = 'Données effacées', telephone = '—', email = null, commentaire = null where operation_id = p_op;
  get diagnostics n = row_count;
  update lots set visite_note = null where operation_id = p_op;
  return n;
end $$;

revoke execute on function public.admin_purge_personal(text, uuid) from public;
grant execute on function public.admin_purge_personal(text, uuid) to anon, authenticated;
