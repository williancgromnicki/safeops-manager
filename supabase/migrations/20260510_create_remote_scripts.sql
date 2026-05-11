-- SafeOps Manager — Biblioteca de scripts remotos
-- Execute no SQL Editor do Supabase antes do deploy deste pacote.

create table if not exists public.remote_scripts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  scope text not null default 'customer',
  name text not null,
  description text,
  shell text not null default 'powershell',
  script_body text not null,
  status text not null default 'pending_review',
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists remote_scripts_customer_id_idx
  on public.remote_scripts(customer_id);

create index if not exists remote_scripts_scope_idx
  on public.remote_scripts(scope);

create index if not exists remote_scripts_status_idx
  on public.remote_scripts(status);

create index if not exists remote_scripts_created_at_idx
  on public.remote_scripts(created_at desc);

alter table public.remote_scripts enable row level security;

drop policy if exists "remote_scripts_select_for_related_users" on public.remote_scripts;
create policy "remote_scripts_select_for_related_users"
on public.remote_scripts
for select
using (
  scope = 'safesys'
  or exists (
    select 1
    from public.user_customer_access uca
    where uca.customer_id = remote_scripts.customer_id
      and uca.user_id = auth.uid()
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

-- Scripts iniciais aprovados pela Safesys.
-- Estes scripts ainda não executam neste pacote; eles alimentam a biblioteca.
insert into public.remote_scripts (
  scope,
  customer_id,
  name,
  description,
  shell,
  script_body,
  status,
  created_by_email
)
select
  'safesys',
  null,
  'Diagnóstico básico do Windows',
  'Coleta hostname, usuário, SO, IPs, uptime e espaço em disco.',
  'powershell',
  $script$
$ErrorActionPreference = "Continue"
Write-Output "=== SafeOps - Diagnóstico básico ==="
Write-Output "Hostname: $env:COMPUTERNAME"
Write-Output "Usuário: $env:USERNAME"
Write-Output "Sistema operacional:"
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime | Format-List
Write-Output "Endereços IP:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "169.254*"} | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize
Write-Output "Discos:"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, VolumeName, Size, FreeSpace | Format-Table -AutoSize
$script$,
  'approved',
  'safesys'
where not exists (
  select 1 from public.remote_scripts
  where scope = 'safesys'
    and name = 'Diagnóstico básico do Windows'
);

insert into public.remote_scripts (
  scope,
  customer_id,
  name,
  description,
  shell,
  script_body,
  status,
  created_by_email
)
select
  'safesys',
  null,
  'Forçar atualização de inventário básico',
  'Executa comandos leves para coleta de informações úteis antes de uma análise.',
  'powershell',
  $script$
$ErrorActionPreference = "Continue"
Write-Output "=== SafeOps - Inventário básico ==="
Get-ComputerInfo | Select-Object CsName, WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer | Format-List
Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber | Format-List
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors | Format-List
Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, Capacity, Speed | Format-Table -AutoSize
$script$,
  'approved',
  'safesys'
where not exists (
  select 1 from public.remote_scripts
  where scope = 'safesys'
    and name = 'Forçar atualização de inventário básico'
);
