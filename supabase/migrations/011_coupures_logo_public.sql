-- Site « Avis de coupure d'eau » : la page affichée par le gardien lit le logo du bailleur
-- à partir de son identifiant (uuid non devinable, présent dans le lien de l'avis).
create or replace function public.public_bailleur_logo(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', b.nom, 'logo', b.logo) from public.bailleurs b where b.id = p_id;
$$;
revoke all on function public.public_bailleur_logo(uuid) from public;
grant execute on function public.public_bailleur_logo(uuid) to anon, authenticated;
