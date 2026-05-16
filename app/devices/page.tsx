import { redirect } from 'next/navigation';

import { DevicesTableWithGroups } from '@/components/DevicesTableWithGroups';
import { EmptyState } from '@/components/EmptyState';
import { resolveCurrentCustomer } from '@/lib/data/get-current-customer';
import { getDevices, type DeviceListItem } from '@/lib/data/get-devices';
import { getSitesForCustomer } from '@/lib/data/get-sites';
import { DEMO_DEVICES } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

type DevicesPageProps = {
  searchParams?: Promise<{
    customerId?: string;
  }>;
};

function mapDemoDeviceToListItem(
  device: (typeof DEMO_DEVICES)[number],
): DeviceListItem {
  return {
    id: device.id,
    customerId: device.customerId,
    name: device.name,
    site: device.site,
    status: device.status,
    operatingSystem: device.operatingSystem,
    lastSeen: device.lastSeen,
    activeAlerts: device.activeAlerts,
    manufacturer: null,
    model: null,
    serialNumber: null,
    cpu: null,
    ramGb: null,
    diskTotalGb: null,
    lastInventoryAt: null,
  };
}

export default async function DevicesPage({ searchParams }: DevicesPageProps) {
  const params = searchParams ? await searchParams : {};
  const customerContext = await resolveCurrentCustomer(params.customerId);

  if (!customerContext) {
    redirect('/login');
  }

  const activeCustomer = customerContext.activeCustomer;

  if (!activeCustomer) {
    return (
      <section className="space-y-6">
        <div>
          <h2 className="section-title">Dispositivos</h2>

          <p className="mt-2 text-sm text-slate-600">
            Inventário operacional dos clientes vinculados ao seu usuário.
          </p>
        </div>

        <EmptyState
          title="Nenhum cliente vinculado"
          description="Seu usuário ainda não possui clientes vinculados para exibição de dispositivos."
        />
      </section>
    );
  }

  const isDemoCustomer = activeCustomer.customerSlug === 'safesys-demo';

  const [realDevices, sites] = await Promise.all([
    getDevices(activeCustomer.customerId),
    getSitesForCustomer(activeCustomer.customerId),
  ]);

  const list: DeviceListItem[] =
    isDemoCustomer && realDevices.length === 0
      ? DEMO_DEVICES.map(mapDemoDeviceToListItem)
      : realDevices;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">
          Dispositivos - {activeCustomer.customerName}
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Inventário operacional sincronizado com os agentes SafeOps. O status
          online/offline considera o último check-in registrado pelo dispositivo.
        </p>

        <p className="mt-1 text-xs text-slate-500">
          A sincronização automática ocorre periodicamente. O botão de atualização
          na barra de grupos solicita uma sincronização global manual do SafeOps.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="space-y-4">
          <DevicesTableWithGroups
            customerId={activeCustomer.customerId}
            devices={[]}
            sites={sites}
          />

          <EmptyState
            title="Nenhum dispositivo registrado"
            description="Quando dispositivos forem cadastrados ou sincronizados para este cliente, eles aparecerão nesta listagem."
          />
        </div>
      ) : (
        <DevicesTableWithGroups
          customerId={activeCustomer.customerId}
          devices={list}
          sites={sites}
        />
      )}
    </section>
  );
}
