-- Le technicien peut ajouter un logement oublié ou supprimer un logement saisi par erreur
create or replace function public._tech_op(p_token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from operations where tech_token = p_token and coalesce(p_token,'') <> '';
  if v is null then raise exception 'ACCES_REFUSE'; end if;
  return v;
end $$;

create or replace function public.tech_add_lot(p_token text, p_batiment uuid, p_etage int, p_numero text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v uuid; v_lot uuid;
begin
  v := public._tech_op(p_token);
  if not exists(select 1 from batiments where id = p_batiment and operation_id = v) then raise exception 'BATIMENT_INTROUVABLE'; end if;
  if coalesce(trim(p_numero),'') = '' or p_etage is null then raise exception 'LOT_REQUIS'; end if;
  begin
    insert into lots(operation_id, batiment_id, etage, numero, created_by) values (v, p_batiment, p_etage, trim(p_numero), 'tech') returning id into v_lot;
  exception when unique_violation then raise exception 'LOT_EXISTE_DEJA';
  end;
  return v_lot;
end $$;

create or replace function public.tech_delete_lot(p_token text, p_lot uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public._tech_op(p_token);
  if exists(select 1 from reservations where lot_id = p_lot) then raise exception 'LOT_DEJA_RESERVE'; end if;
  delete from lots where id = p_lot and operation_id = v;
  if not found then raise exception 'LOT_INTROUVABLE'; end if;
end $$;

revoke execute on function public._tech_op(text) from public, anon, authenticated;
revoke execute on function public.tech_add_lot(text, uuid, int, text) from public;
revoke execute on function public.tech_delete_lot(text, uuid) from public;
grant execute on function public.tech_add_lot(text, uuid, int, text), public.tech_delete_lot(text, uuid) to anon, authenticated;
