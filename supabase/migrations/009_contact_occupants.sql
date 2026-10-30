-- Contact affiché aux occupants (gardien, Sallandre, gestionnaire…) : facultatif, il n'y a pas toujours de gardien
alter table public.operations add column contact text check (length(coalesce(contact,'')) <= 200);
-- _op_json renvoie désormais operation.contact (voir migration appliquée « contact_occupants »)

create or replace function public.admin_set_contact(p_token text, p_op uuid, p_contact text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._staff_op(p_token, p_op, true);
  update operations set contact = nullif(trim(coalesce(p_contact,'')),'') where id = p_op;
end $$;

revoke execute on function public.admin_set_contact(text, uuid, text) from public;
grant execute on function public.admin_set_contact(text, uuid, text) to anon, authenticated;
