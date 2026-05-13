-- SafeOps Manager — Monitoring Alert Policies
-- Patch 4.2.1.1
--
-- Base de políticas de alertas sem alteração visual da tela de Monitoramento.
-- Mantém suporte interno para:
-- - checks existentes;
-- - checks padronizados Safesys;
-- - escopo por cliente/site/dispositivo;
-- - thresholds, frequência e destinatários.

create table if not exists public.monitoring_alert_policies (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.customers(id) on delete cascade,

  -- Nome exibível/operacional da política.
  name text not null,

  -- Tipo funcional do monitoramento.
  -- Exemplos: memory, disk, cpu, ping, service, script, event_log
  alert_type text not null default 'memory',

  -- Campo interno. Não deve ser exposto ao usuário final.
  -- native = modelo atual da base de monitoramento
  -- safesys = modelo padronizado Safesys
  implementation text not null default 'native'
    check (implementation in ('native', 'safesys')),

  -- Nome técnico do check a ser criado/atualizado.
  check_name text not null,

  scope_type text not null default 'customer'
    check (scope_type in ('customer', 'site', 'device')),
  site_name text null,
  device_id uuid null references public.devices(id) on delete set null,
  agent_id text null,
  hostname text null,

  enabled boolean not null default true,

  -- Thresholds genéricos.
  -- Para memória/CPU: percentual de uso.
  -- Para disco no padrão Safesys: percentual mínimo livre.
  warn_percent integer null
    check (warn_percent is null or (warn_percent >= 1 and warn_percent <= 100)),
  crit_percent integer null
    check (crit_percent is null or (crit_percent >= 1 and crit_percent <= 100)),

  frequency_minutes integer not null default 15
    check (frequency_minutes in (5, 10, 15, 30, 60, 120, 240, 720, 1440)),

  alert_emails text[] not null default '{}',
  notify_on_recovery boolean not null default false,

  -- Argumentos visíveis e protegidos ficam separados.
  visible_parameters jsonb not null default '{}'::jsonb,
  protected_parameters jsonb not null default '{}'::jsonb,

  -- Rastreio de aplicação futura nos checks reais.
  external_check_id text null,
  external_result_id text null,
  last_apply_status text not null default 'not_applied',
  last_apply_message text null,
  last_applied_at timestamptz null,

  created_by_user_id uuid null,
  created_by_email text null,
  updated_by_user_id uuid null,
  updated_by_email text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitoring_alert_policies_customer_id_idx
  on public.monitoring_alert_policies(customer_id);

create index if not exists monitoring_alert_policies_type_idx
  on public.monitoring_alert_policies(customer_id, alert_type);

create index if not exists monitoring_alert_policies_scope_idx
  on public.monitoring_alert_policies(customer_id, scope_type);

create index if not exists monitoring_alert_policies_implementation_idx
  on public.monitoring_alert_policies(implementation);

alter table public.monitoring_alert_policies enable row level security;

drop policy if exists "monitoring_alert_policies_service_role" on public.monitoring_alert_policies;

create policy "monitoring_alert_policies_service_role"
on public.monitoring_alert_policies
for all
to service_role
using (true)
with check (true);
