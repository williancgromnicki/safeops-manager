import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/EmptyState';
import { RemoteBackgroundWorkspace } from '@/components/RemoteBackgroundWorkspace';
import { getDeviceDetail } from '@/lib/data/get-device-detail';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

type RemoteBackgroundPageProps = {
  params: Promise<{
    deviceId: string;
  }>;
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

export default async function RemoteBackgroundPage({
  params,
  searchParams,
}: RemoteBackgroundPageProps) {
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
        <h2 className="section-title">Operação remota</h2>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para operação remota."
        />
      </section>
    );
  }

  const device = await getDeviceDetail(activeCustomer.customerId, deviceId);

  const deviceHref = `/devices/${encodeURIComponent(
    deviceId,
  )}?customerId=${encodeURIComponent(activeCustomer.customerId)}`;

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

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={deviceHref}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            ← Voltar para o dispositivo
          </Link>

          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Operação remota
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Operações remotas em segundo plano para {device.name}.
          </p>
        </div>
      </div>

      <RemoteBackgroundWorkspace
        deviceId={deviceId}
        customerId={activeCustomer.customerId}
        deviceName={device.name}
        operatingSystem={device.operatingSystem}
      />
    </section>
  );
}
