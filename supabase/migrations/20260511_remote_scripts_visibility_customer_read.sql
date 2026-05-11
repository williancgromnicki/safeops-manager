-- SafeOps Manager — visibilidade de scripts locais por cliente
-- Regra:
-- 1. Todos veem a biblioteca real do TRMM via API.
-- 2. Usuários comuns veem scripts locais do cliente ao qual têm acesso.
-- 3. Admin Safesys vê todos os scripts locais.
-- 4. Execução continua controlada no backend:
--    usuário comum só executa script local se ele criou e o script estiver approved.
--    Admin Safesys pode aprovar e executar qualquer script local.

alter table public.remote_scripts enable row level security;

drop policy if exists "remote_scripts_select_own_or_admin" on public.remote_scripts;
drop policy if exists "remote_scripts_select_for_related_users" on public.remote_scripts;

create policy "remote_scripts_select_customer_or_admin"
on public.remote_scripts
for select
using (
  exists (
    select 1
    from public.user_customer_access uca
    where uca.user_id = auth.uid()
      and uca.role = 'admin'
  )
  or exists (
    select 1
    from public.user_customer_access uca
    where uca.user_id = auth.uid()
      and uca.customer_id = remote_scripts.customer_id
  )
);

drop policy if exists "remote_scripts_admin_all" on public.remote_scripts;

create policy "remote_scripts_admin_all"
on public.remote_scripts
for all
using (
  exists (
    select 1
    from public.user_customer_access uca
    where uca.user_id = auth.uid()
      and uca.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_customer_access uca
    where uca.user_id = auth.uid()
      and uca.role = 'admin'
  )
);
