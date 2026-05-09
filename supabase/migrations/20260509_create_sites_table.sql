-- SafeOps Manager — tabela de grupos/sites
-- Execute no SQL Editor do Supabase antes de testar criação de grupos adicionais.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  slug text not null,
  tactical_site_id text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sites_customer_slug_key
  on public.sites(customer_id, slug);

create index if not exists sites_customer_id_idx
  on public.sites(customer_id);

create index if not exists sites_tactical_site_id_idx
  on public.sites(tactical_site_id);

alter table public.sites enable row level security;

drop policy if exists "sites_select_for_related_users" on public.sites;
create policy "sites_select_for_related_users"
on public.sites
for select
using (
  exists (
    select 1
    from public.user_customer_access uca
    where uca.customer_id = sites.customer_id
      and uca.user_id = auth.uid()
  )
);

drop policy if exists "sites_admin_all" on public.sites;
create policy "sites_admin_all"
on public.sites
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
