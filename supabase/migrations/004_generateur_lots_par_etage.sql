-- Génération d'un bâtiment avec un nombre de lots différent par étage
-- p_etages : [{"etage": 0, "nb": 2}, {"etage": 1, "nb": 3}, ...] — nb peut être 0
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
    if coalesce(trim(p_nom),'') = '' then raise exception 'NOM_REQUIS'; end if;
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

revoke execute on function public.staff_generate_lots_detail(text, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.staff_generate_lots_detail(text, uuid, uuid, text, jsonb, text) to anon, authenticated;
