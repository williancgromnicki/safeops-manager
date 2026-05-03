import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { getCurrentCustomer } from '@/lib/data/get-current-customer';
import { getDevices } from '@/lib/data/get-devices';
import { DEMO_DEVICES, type DemoDevice, type OperationalStatus } from '@/lib/demo-data';

const statusLabel: Record<OperationalStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  attention: 'Atenção',
  unknown: 'Desconhecido',
};

const statusClassName: Record<OperationalStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  offline: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  attention: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  unknown: 'bg-slate-50 text-slate-700 ring-slate-600/20',
};

function StatusBadge({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        statusClassName[status],
      ].join(' ')}
    >
      {statusLabel[status]}
    </span>
  );
}

export default async function DevicesPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect('/login');
  }

  const devices: DemoDevice[] = customer
    ? (await getDevices(customer.customerId))
    : [];

  const list = devices.length > 0 ? devices : DEMO_DEVICES;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Dispositivos</h2>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo registrado"
          description="Quando dispositivos forem cadastrados ou sincronizados, eles aparecerão nesta listagem."
        />
      ) : (
        <DataTable
          columns={[
            'Dispositivo',
            'Local',
            'Status',
            'Sistema operacional',
            'Último check-in',
            'Alertas ativos',
          ]}
        >
          {list.map((device) => (
            <tr key={device.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{device.name}</td>
              <td className="px-4 py-3">{device.site}</td>
              <td className="px-4 py-3">
                <StatusBadge status={device.status} />
              </td>
              <td className="px-4 py-3">{device.operatingSystem}</td>
              <td className="px-4 py-3">{device.lastSeen}</td>
              <td className="px-4 py-3">{device.activeAlerts}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}
