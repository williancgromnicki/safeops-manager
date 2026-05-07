alter table public.customers
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamp with time zone not null default now();

create table if not exists public.sites (
  id uuid not null default gen_random_uuid(),
  customer_id uuid not null,
  name text not null,
  slug text not null,
  tactical_site_id text null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint sites_pkey primary key (id),
  constraint sites_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete cascade,
  constraint sites_customer_id_slug_key unique (customer_id, slug)
);

create index if not exists idx_sites_customer_id on public.sites using btree (customer_id);
create index if not exists idx_sites_customer_tactical_site on public.sites using btree (customer_id, tactical_site_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_sites_updated_at on public.sites;
create trigger set_sites_updated_at
before update on public.sites
for each row execute function public.set_updated_at();
