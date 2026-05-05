import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SoftwarePageProps = {
  params: Promise<{
    deviceId: string;
  }>;
  searchParams?: Promise<{
    customerId?: string;
    q?: string;
  }>;
};

type DeviceRow = {
  id: string;
  customer_id: string;
  hostname: string;
  operating_system: string | null;
};

type SoftwareRow = {
  id: string;
  software_name: string;
  software_version: string | null;
  publisher: string | null;
  install_date: string | null;
  size: string | null;
  location: string | null;
  source: string | null;
  last_seen_at: string | null;
};

function formatValue(value?: string | null): string {
  return value?.trim() ? value : '—';
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

export default async function DeviceSoftwarePage({
  params,
  searchParams,
}: SoftwarePageProps) {
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
        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de inventário de software."
        />
      </section>
    );
  }

  const supabase = await createClient();

  const { data: deviceData, error: deviceError } = await supabase
    .from('devices')
    .select('id, customer_id, hostname, operating_system')
    .eq('id', deviceId)
    .eq('customer_id', activeCustomer.customerId)
    .eq('visible_to_customer', true)
    .maybeSingle<DeviceRow>();

  if (deviceError) {
    throw new Error(`Erro ao carregar dispositivo: ${deviceError.message}`);
  }

  if (!deviceData) {
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

  const search = query.q?.trim() ?? '';

  let softwareQuery = supabase
    .from('device_software_inventory')
    .select(
      [
        'id',
        'software_name',
        'software_version',
        'publisher',
        'install_date',
        'size',
        'location',
        'source',
        'last_seen_at',
      ].join(', '),
    )
    .eq('customer_id', activeCustomer.customerId)
    .eq('device_id', deviceId)
    .order('software_name', { ascending: true });

  if (search) {
    softwareQuery = softwareQuery.or(
      [
        `software_name.ilike.%${search}%`,
        `publisher.ilike.%${search}%`,
        `software_version.ilike.%${search}%`,
      ].join(','),
    );
  }

  const { data: softwareData, error: softwareError } = await softwareQuery;

  if (softwareError) {
    throw new Error(
      `Erro ao carregar inventário de software: ${softwareError.message}`,
    );
  }

  const software = ((softwareData ?? []) as unknown as SoftwareRow[]);

  const devicesHref = `/devices?customerId=${encodeURIComponent(
    activeCustomer.customerId,
  )}`;

  const deviceHref = `/devices/${encodeURIComponent(
    deviceId,
  )}?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

  const softwareHref = `/devices/${encodeURIComponent(
    deviceId,
  )}/software?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

  return (
    <section className="space-y-6">
      <div>
        <Link
          href={deviceHref}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para resumo do dispositivo
        </Link>

        <div className="mt-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="section-title">Inventário de software</h2>
              <p className="mt-2 text-sm text-slate-600">
                Softwares instalados em{' '}
                <span className="font-semibold text-slate-800">
                  {deviceData.hostname}
                </span>{' '}
                — {deviceData.operating_system ?? 'Sistema não informado'}.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Cliente: {activeCustomer.customerName}
              </p>
            </div>

            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Total inventariado
              </p>
              <p className="mt-1 text-2xl font-bold">{software.length}</p>
            </div>
          </div>

          <form action={softwareHref} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="hidden"
              name="customerId"
              value={activeCustomer.customerId}
            />

            <input
              name="q"
              defaultValue={search}
              placeholder="Buscar por software, fabricante ou versão"
              className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />

            <button
              type="submit"
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
            >
              Buscar
            </button>

            {search ? (
              <Link
                href={softwareHref}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Limpar
              </Link>
            ) : null}
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        {software.length === 0 ? (
          <EmptyState
            title="Nenhum software encontrado"
            description={
              search
                ? 'Nenhum software corresponde ao filtro informado.'
                : 'Este dispositivo ainda não possui inventário de software sincronizado.'
            }
          />
        ) : (
          <DataTable
            columns={[
              'Software',
              'Versão',
              'Fabricante',
              'Tamanho',
              'Instalação',
              'Localização',
              'Fonte',
              'Atualizado em',
            ]}
          >
            {software.map((item) => (
              <tr key={item.id} className="align-top text-slate-700">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">
                    {item.software_name}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatValue(item.software_version)}
                </td>

                <td className="px-4 py-3 text-sm">
                  {formatValue(item.publisher)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatValue(item.size)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatValue(item.install_date)}
                </td>

                <td className="max-w-sm px-4 py-3 text-sm">
                  <span className="break-all">{formatValue(item.location)}</span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatValue(item.source)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {formatDateTime(item.last_seen_at)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div>
        <Link
          href={devicesHref}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Voltar para lista de dispositivos
        </Link>
      </div>
    </section>
  );
}
