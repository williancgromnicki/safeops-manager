import { DEMO_DEVICES, type DemoDevice, type OperationalStatus } from '@/lib/demo-data';

const devices: DemoDevice[] = DEMO_DEVICES;

const statusConfig: Record<
  OperationalStatus,
  {
    label: string;
    className: string;
  }
> = {
  online: {
    label: 'Online',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  offline: {
    label: 'Offline',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
  attention: {
    label: 'Atenção',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  unknown: {
    label: 'Desconhecido',
    className: 'bg-slate-50 text-slate-700 ring-slate-600/20',
  },
};

function StatusBadge({ status }: { status: OperationalStatus }) {
  const config = statusConfig[status];

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        config.className,
      ].join(' ')}
    >
      {config.label}
    </span>
  );
}

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Dispositivos
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Acompanhe os dispositivos monitorados pelo SafeOps Manager.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Dispositivos monitorados
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Visão geral dos equipamentos vinculados ao ambiente do cliente.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Local
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sistema operacional
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Último check-in
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Alertas ativos
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {devices.map((device) => (
                <tr key={device.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {device.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {device.site}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={device.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {device.operatingSystem}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {device.lastSeen}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {device.activeAlerts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
