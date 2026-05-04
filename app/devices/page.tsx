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

type DeviceWithHardwareInventory = {
  hardwareInventory?: HardwareInventory | null;
  hardware_inventory?: HardwareInventory | null;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
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

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function InfoItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
        {formatValue(value)}
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
  children: React.ReactNode;
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
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Dados ainda não disponíveis para esta seção.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(data).map(([key, value]) => (
        <InfoItem key={key} label={key} value={value} />
      ))}
    </div>
  );
}

function ArrayList({ data }: { data?: unknown[] }) {
  if (!data || data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Dados ainda não disponíveis para esta seção.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((item, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Item {index + 1}
          </p>

          {typeof item === 'object' && item !== null ? (
            <ObjectGrid data={item as Record<string, unknown>} />
          ) : (
            <p className="text-sm font-medium text-slate-800">
              {formatValue(item)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function RawJsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(data, null, 2)}
    </pre>
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

  const deviceDetailHref = `/devices/${device.id}?customerId=${encodeURIComponent(
    activeCustomer.customerId,
  )}`;

  const basicIdentification = {
    hostname: device.name,
    cliente: activeCustomer.customerName,
    site: device.site,
    sistema_operacional: device.operatingSystem,
    fabricante: device.manufacturer,
    modelo: device.model,
    serial: device.serialNumber,
    ultimo_check_in: device.lastSeen,
    ultimo_inventario: device.lastInventoryAt,
  };

  const basicHardware = {
    cpu: device.cpu,
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
                  Visão técnica detalhada do equipamento. Esta tela será
                  enriquecida conforme o SafeOps Sync passar a coletar dados
                  completos de hardware, rede, armazenamento e adaptadores.
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
            equipamento. Quando o campo de inventário detalhado for habilitado
            no banco e preenchido pelo script de sincronização, esta página
            exibirá informações completas de discos, rede, GPU, volumes e demais
            componentes.
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
        <div className="space-y-4">
          <ObjectGrid data={hardwareInventory?.cpu ?? basicHardware} />

          {hardwareInventory?.memory && (
            <ObjectGrid data={hardwareInventory.memory} />
          )}
        </div>
      </InventorySection>

      <InventorySection
        title="Armazenamento físico"
        description="Discos físicos, SSDs, NVMes, seriais, interfaces e status quando disponíveis."
      >
        <ObjectGrid data={hardwareInventory?.storage} />
      </InventorySection>

      <InventorySection
        title="Rede"
        description="Adaptadores de rede, endereços IP, MAC, gateways, DNS e status dos links."
      >
        <ObjectGrid data={hardwareInventory?.network} />
      </InventorySection>

      <InventorySection
        title="Adaptadores gráficos"
        description="Placas de vídeo, drivers e memória gráfica quando disponíveis."
      >
        <ArrayList data={hardwareInventory?.graphics} />
      </InventorySection>

      <InventorySection
        title="Sistema operacional"
        description="Versão, build, arquitetura e demais informações do sistema operacional."
      >
        <ObjectGrid data={hardwareInventory?.operatingSystem} />
      </InventorySection>

      <InventorySection
        title="Dados brutos do inventário"
        description="Representação técnica completa do inventário recebido pelo SafeOps Manager."
      >
        {hardwareInventory ? (
          <RawJsonBlock data={hardwareInventory} />
        ) : (
          <RawJsonBlock
            data={{
              message:
                'hardware_inventory ainda não está disponível para este dispositivo.',
              basic_identification: basicIdentification,
              basic_hardware: basicHardware,
            }}
          />
        )}
      </InventorySection>
    </section>
  );
}
