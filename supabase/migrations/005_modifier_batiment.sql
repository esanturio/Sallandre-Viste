-- Modifier la structure d'un bâtiment existant : nombre de lots par étage (ajout / retrait)
-- p_etages : [{"etage": 0, "nb": 2}, ...] — un étage absent de la liste vise 0 lot
create or replace function public.staff_update_structure(p_token text, p_op uuid, p_batiment uuid, p_nom text,
  p_etages jsonb, p_numerotation text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v uuid; v_by text; x jsonb; e int; cible int; actuel int; i int; k int; v_num text;
  ajoutes int := 0; retires int := 0; c int; v_etages int[];
begin
  v := public._staff_op(p_token, p_op);
  v_by := case when public._is_admin(p_token) then 'admin' else 'concierge' end;
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  if p_numerotation not in ('continue','etage','lettre') then raise exception 'TYPE_INVALIDE'; end if;
  if jsonb_typeof(p_etages) <> 'array' or jsonb_array_length(p_etages) > 90 then raise exception 'ETAGES_INVALIDES'; end if;

  if coalesce(trim(p_nom),'') <> '' then update batiments set nom = trim(p_nom) where id = p_batiment; end if;

  -- Tous les étages concernés : ceux demandés + ceux qui existent déjà
  select array_agg(distinct et) into v_etages from (
    select (value->>'etage')::int et from jsonb_array_elements(p_etages)
    union select etage from lots where batiment_id = p_batiment) s;

  select coalesce(max(numero::int), 0) into k from lots where batiment_id = p_batiment and numero ~ '^\d{1,6}$';

  foreach e in array coalesce(v_etages, '{}') loop
    select coalesce((select (value->>'nb')::int from jsonb_array_elements(p_etages) where (value->>'etage')::int = e limit 1), 0) into cible;
    if cible < 0 or cible > 60 then raise exception 'LOTS_PAR_ETAGE_INVALIDE'; end if;
    select count(*) into actuel from lots where batiment_id = p_batiment and etage = e;

    if cible < actuel then
      -- Retire les derniers lots de l'étage qui n'ont ni rendez-vous ni visite
      with a_suppr as (
        select l.id from lots l
        where l.batiment_id = p_batiment and l.etage = e
          and not exists(select 1 from reservations r where r.lot_id = l.id) and l.visite is null
        order by length(l.numero) desc, l.numero desc
        limit actuel - cible)
      delete from lots where id in (select id from a_suppr);
      get diagnostics c = row_count; retires := retires + c;
      if c < actuel - cible then raise exception 'LOTS_AVEC_RDV'; end if;

    elsif cible > actuel then
      i := 0;
      while (select count(*) from lots where batiment_id = p_batiment and etage = e) < cible loop
        i := i + 1;
        if i > 500 then exit; end if;
        if p_numerotation = 'continue' then k := k + 1; v_num := k::text;
        elsif p_numerotation = 'etage' then
          v_num := case when e > 0 then (e*100 + i)::text when e = 0 then lpad(i::text, 2, '0') else 'SS' || (-e) || '-' || i end;
        else v_num := case when i <= 26 then chr(64 + i) else i::text end;
        end if;
        insert into lots(operation_id, batiment_id, etage, numero, created_by) values (v, p_batiment, e, v_num, v_by) on conflict do nothing;
        get diagnostics c = row_count; ajoutes := ajoutes + c;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('ajoutes', ajoutes, 'retires', retires);
end $$;

-- Renommer un bâtiment : ouvert au gardien
create or replace function public.staff_rename_batiment(p_token text, p_op uuid, p_batiment uuid, p_nom text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS'; end if;
  update batiments set nom = trim(p_nom) where id = p_batiment and operation_id = v;
  if not found then raise exception 'BATIMENT_INTROUVABLE'; end if;
end $$;

-- Supprimer un bâtiment (ou, si c'est le seul, le vider) : ouvert au gardien
create or replace function public.staff_delete_batiment(p_token text, p_op uuid, p_batiment uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._staff_op(p_token, p_op);
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  if exists(select 1 from reservations r join lots l on l.id = r.lot_id where l.batiment_id = p_batiment) then raise exception 'BATIMENT_A_DES_RESERVATIONS'; end if;
  if (select count(*) from batiments where operation_id = v) <= 1 then
    delete from lots where batiment_id = p_batiment;
    update batiments set nom = 'Bâtiment unique' where id = p_batiment;
    return 'vide';
  end if;
  delete from batiments where id = p_batiment;
  return 'supprime';
end $$;

revoke execute on function public.staff_update_structure(text, uuid, uuid, text, jsonb, text) from public;
revoke execute on function public.staff_rename_batiment(text, uuid, uuid, text) from public;
revoke execute on function public.staff_delete_batiment(text, uuid, uuid) from public;
grant execute on function
  public.staff_update_structure(text, uuid, uuid, text, jsonb, text),
  public.staff_rename_batiment(text, uuid, uuid, text),
  public.staff_delete_batiment(text, uuid, uuid)
to anon, authenticated;
