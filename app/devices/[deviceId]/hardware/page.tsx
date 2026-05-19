import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DevicePlatformIcon } from '@/components/DevicePlatformIcon';
import { EmptyState } from '@/components/EmptyState';
import { getDeviceDetail } from '@/lib/data/get-device-detail';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type HardwareInventoryPageProps = {
  params: Promise<{
    deviceId: string;
  }>;
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

type HardwareInventory = {
  identification?: Record<string, unknown>;
  cpu?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  network?: Record<string, unknown>;
  graphics?: unknown[];
  operatingSystem?: Record<string, unknown>;
  raw?: unknown;
};

type StorageInventory = {
  summary?: Record<string, unknown>;
  physical_disks?: unknown[];
  volumes?: unknown[];
};

type NetworkInventory = {
  adapter_count?: number;
  adapters?: unknown[];
};

type DeviceWithHardwareInventory = {
  hardwareInventory?: HardwareInventory | null;
  hardware_inventory?: HardwareInventory | null;
};

const labelMap: Record<string, string> = {
  hostname: 'Hostname',
  client: 'Cliente',
  cliente: 'Cliente',
  site: 'Site',
  manufacturer: 'Fabricante',
  fabricante: 'Fabricante',
  model: 'Modelo',
  modelo: 'Modelo',
  serial_number: 'Número de série',
  serial: 'Número de série',
  tactical_agent_id: 'ID operacional do agente',
  last_seen_at: 'Último check-in',
  ultimo_check_in: 'Último check-in',
  last_inventory_at: 'Último inventário',
  ultimo_inventario: 'Último inventário',

  name: 'Nome',
  description: 'Descrição',
  caption: 'Descrição',
  cores: 'Núcleos',
  threads: 'Threads',
  manufacturer_cpu: 'Fabricante',
  max_clock_speed_mhz: 'Clock máximo',
  total_gb: 'Total',
  total_ram_gb: 'Memória RAM',
  memoria_ram_gb: 'Memória RAM',

  summary: 'Resumo',
  physical_disks: 'Discos físicos',
  volumes: 'Volumes',
  physical_disk_count: 'Discos físicos',
  volume_count: 'Volumes',
  free_gb: 'Livre',
  used_percent: 'Uso',
  size_gb: 'Tamanho',
  letter: 'Unidade',
  label: 'Rótulo',
  file_system: 'Sistema de arquivos',
  drive_type: 'Tipo de unidade',
  model_disk: 'Modelo',
  serial_disk: 'Serial',
  interface_type: 'Interface',
  media_type: 'Tipo de mídia',
  status: 'Status',

  adapter_count: 'Adaptadores',
  adapters: 'Adaptadores',
  public_ip: 'IP público',
  primary_private_ip: 'IP privado principal',
  primary_ipv4: 'IPv4 principal',
  mac_address: 'MAC',
  ip_addresses: 'Endereços IP',
  gateways: 'Gateway',
  dns_servers: 'DNS',
  dhcp_enabled: 'DHCP',
  dhcp_server: 'Servidor DHCP',
  speed: 'Velocidade',
  index: 'Índice',
  net_enabled: 'Adaptador habilitado',
  physical_adapter: 'Adaptador físico',
  ip_enabled: 'IP habilitado',

  driver_version: 'Versão do driver',
  video_processor: 'Processador gráfico',
  adapter_ram_gb: 'Memória gráfica',

  operatingSystem: 'Sistema operacional',
  platform: 'Plataforma',
  version: 'Versão',
  build_number: 'Build',
  architecture: 'Arquitetura',
  install_date: 'Data de instalação',
  last_boot_up_time: 'Último boot',
};

function humanizeKey(key: string): string {
  return (
    labelMap[key] ??
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDateLike(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

function formatSpeed(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 'Não informado';
  }

  if (numericValue > 1_000_000_000_000) {
    return 'Não informado';
  }

  if (numericValue >= 1_000_000_000) {
    return `${Number((numericValue / 1_000_000_000).toFixed(2))} Gbps`;
  }

  if (numericValue >= 1_000_000) {
    return `${Number((numericValue / 1_000_000).toFixed(2))} Mbps`;
  }

  if (numericValue >= 1_000) {
    return `${Number((numericValue / 1_000).toFixed(2))} Kbps`;
  }

  return `${numericValue} bps`;
}

function translateConnectionStatus(value: unknown): string {
  const normalized = String(value ?? '').trim();

  const statusMap: Record<string, string> = {
    '0': 'Desconectado',
    '1': 'Conectando',
    '2': 'Conectado',
    '3': 'Desconectando',
    '4': 'Hardware ausente',
    '5': 'Hardware desabilitado',
    '6': 'Falha de hardware',
    '7': 'Mídia desconectada',
    '8': 'Autenticando',
    '9': 'Autenticação bem-sucedida',
    '10': 'Autenticação falhou',
    '11': 'Endereço inválido',
    '12': 'Credenciais necessárias',
    OK: 'OK',
  };

  return statusMap[normalized] ?? (normalized || 'Não informado');
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  if (key === 'speed') {
    return formatSpeed(value);
  }

  if (key === 'status') {
    return translateConnectionStatus(value);
  }

  if (key.endsWith('_gb') && typeof value === 'number') {
    return `${value} GB`;
  }

  if (key === 'used_percent' && typeof value === 'number') {
    return `${value}%`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'Não informado';
    }

    return value
      .map((item) =>
        typeof item === 'object' && item !== null
          ? JSON.stringify(item, null, 2)
          : String(item),
      )
      .join(', ');
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return formatDateLike(value);
    }

    return value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function removeTechnicalFields(
  data?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  const hiddenKeys = new Set([
  'raw',
  'summary',
  'physical_disks',
  'volumes',
  'adapters',
  'tactical_agent_id',
  'agent_id',
]);

  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !hiddenKeys.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== '',
  );

  return Object.fromEntries(entries);
}

function InfoItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
        {value as ReactNode}
      </p>
    </div>
  );
}

function InventorySection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-surface-border bg-white p-5 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <h3 className="section-title">{title}</h3>

          {description && (
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          )}
        </div>

        <span className="mt-1 rounded-full border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition group-open:rotate-180">
          ↓
        </span>
      </summary>

      <div className="mt-5">{children}</div>
    </details>
  );
}

function ObjectGrid({ data }: { data?: Record<string, unknown> }) {
  const cleanData = removeTechnicalFields(data);

  if (!cleanData || Object.keys(cleanData).length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Dados ainda não disponíveis para esta seção.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(cleanData).map(([key, value]) => (
        <InfoItem
          key={key}
          label={humanizeKey(key)}
          value={formatValue(key, value)}
        />
      ))}
    </div>
  );
}

function ArrayCards({
  data,
  titlePrefix,
}: {
  data?: unknown[];
  titlePrefix: string;
}) {
  if (!data || data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Dados ainda não disponíveis para esta seção.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((item, index) => {
        if (!isRecord(item)) {
          return (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-sm font-medium text-slate-800">
                {formatValue('value', item)}
              </p>
            </div>
          );
        }

        const cleanItem = removeTechnicalFields(item) ?? {};
        const name =
          formatValue('name', cleanItem.name) !== 'Não informado'
            ? formatValue('name', cleanItem.name)
            : `${titlePrefix} ${index + 1}`;

        return (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex flex-col gap-1 border-b border-slate-100 pb-3">
              <p className="text-sm font-semibold text-slate-900">{name}</p>

              {'model' in cleanItem && (
                <p className="text-xs text-slate-500">
                  {formatValue('model', cleanItem.model)}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(cleanItem)
                .filter(([key]) => key !== 'name')
                .map(([key, value]) => (
                  <InfoItem
                    key={key}
                    label={humanizeKey(key)}
                    value={formatValue(key, value)}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StorageSection({ storage }: { storage?: Record<string, unknown> }) {
  const storageInventory = storage as StorageInventory | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800">Resumo</h4>
        <ObjectGrid data={storageInventory?.summary} />
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800">
          Discos físicos
        </h4>
        <ArrayCards
          data={storageInventory?.physical_disks}
          titlePrefix="Disco"
        />
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800">
          Volumes e partições
        </h4>
        <ArrayCards data={storageInventory?.volumes} titlePrefix="Volume" />
      </div>
    </div>
  );
}

function NetworkSection({ network }: { network?: Record<string, unknown> }) {
  const networkInventory = network as
    | (NetworkInventory & {
        public_ip?: unknown;
        primary_private_ip?: unknown;
      })
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800">
          Resumo de rede
        </h4>

        <ObjectGrid
          data={{
            public_ip: networkInventory?.public_ip,
            primary_private_ip: networkInventory?.primary_private_ip,
            adapter_count: networkInventory?.adapter_count,
          }}
        />
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800">
          Adaptadores de rede
        </h4>

        <ArrayCards
          data={networkInventory?.adapters}
          titlePrefix="Adaptador"
        />
      </div>
    </div>
  );
}


export default async function HardwareInventoryPage({
  params,
  searchParams,
}: HardwareInventoryPageProps) {
  const { deviceId } = await params;
  const query = searchParams ? await searchParams : {};

  const customerContext = await resolveCurrentCustomer(query.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <h2 className="section-title">Inventário de Hardware</h2>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de dispositivos."
        />
      </section>
    );
  }

  const device = await getDeviceDetail(activeCustomer.customerId, deviceId);

  if (!device) {
    return (
      <section className="space-y-6">
        <Link
          href={`/devices?customerId=${encodeURIComponent(
            activeCustomer.customerId,
          )}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para dispositivos
        </Link>

        <EmptyState
          title="Dispositivo não encontrado"
          description="O dispositivo não existe, não pertence ao cliente selecionado ou não está visível para o portal."
        />
      </section>
    );
  }

  const deviceWithInventory = device as typeof device &
    DeviceWithHardwareInventory;

  const hardwareInventory =
    deviceWithInventory.hardwareInventory ??
    deviceWithInventory.hardware_inventory ??
    null;

  const deviceDetailHref = `/devices/${encodeURIComponent(
    deviceId,
  )}?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

  const basicIdentification = {
    hostname: device.name,
    client: activeCustomer.customerName,
    site: device.site,
    operating_system: device.operatingSystem,
    manufacturer: device.manufacturer,
    model: device.model,
    serial_number: device.serialNumber,
    last_seen_at: device.lastSeen,
    last_inventory_at: device.lastInventoryAt,
  };

  const basicHardware = {
    name: device.cpu,
    memoria_ram_gb: device.ramGb,
    disco_total_gb: device.diskTotalGb,
  };

  return (
    <section className="space-y-6">
      <div>
        <Link
          href={deviceDetailHref}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para detalhes do dispositivo
        </Link>

        <div className="mt-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <DevicePlatformIcon
                operatingSystem={device.operatingSystem}
                deviceName={device.name}
              />

              <div>
                <h2 className="section-title">
                  Inventário de Hardware - {device.name}
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Visão técnica detalhada do equipamento, incluindo hardware,
                  armazenamento, rede, vídeo e dados brutos de inventário.
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Fonte:{' '}
                  {device.inventorySource ?? 'SafeOps Inventory Sync'} • Versão:{' '}
                  {device.inventoryVersion ?? 'Não informada'}
                </p>
              </div>
            </div>

            <Link
              href={deviceDetailHref}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Resumo do dispositivo
            </Link>
          </div>
        </div>
      </div>

      {!hardwareInventory && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-semibold text-amber-900">
            Inventário detalhado ainda não disponível
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-amber-800">
            O SafeOps Manager ainda possui apenas o resumo principal deste
            equipamento. Quando o campo de inventário detalhado for preenchido
            pelo script de sincronização, esta página exibirá informações
            completas de discos, rede, GPU, volumes e demais componentes.
          </p>
        </div>
      )}

      <InventorySection
        title="Identificação do equipamento"
        description="Informações principais de identificação e vínculo do dispositivo."
        defaultOpen
      >
        <ObjectGrid
          data={hardwareInventory?.identification ?? basicIdentification}
        />
      </InventorySection>

      <InventorySection
        title="Processador e memória"
        description="Resumo de CPU, núcleos, threads e memória RAM quando disponível."
        defaultOpen
      >
        <div className="space-y-6">
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-800">
              Processador
            </h4>
            <ObjectGrid data={hardwareInventory?.cpu ?? basicHardware} />
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-800">
              Memória
            </h4>
            <ObjectGrid data={hardwareInventory?.memory} />
          </div>
        </div>
      </InventorySection>

      <InventorySection
        title="Armazenamento"
        description="Discos físicos, SSDs, NVMes, volumes, partições e uso de espaço."
        defaultOpen
      >
        <StorageSection storage={hardwareInventory?.storage} />
      </InventorySection>

      <InventorySection
        title="Rede"
        description="Adaptadores de rede, MAC, velocidade, IPs, gateways e DNS quando disponíveis."
        defaultOpen
      >
        <NetworkSection network={hardwareInventory?.network} />
      </InventorySection>

      <InventorySection
        title="Adaptadores gráficos"
        description="Placas de vídeo, drivers e memória gráfica quando disponíveis."
        defaultOpen
      >
        <ArrayCards
          data={hardwareInventory?.graphics}
          titlePrefix="Adaptador gráfico"
        />
      </InventorySection>

      <InventorySection
        title="Sistema operacional"
        description="Versão, build, arquitetura e demais informações do sistema operacional."
      >
        <ObjectGrid data={hardwareInventory?.operatingSystem} />
      </InventorySection>

      
    </section>
  );
}
