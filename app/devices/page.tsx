import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { DEMO_DEVICES, type DemoDevice } from '@/lib/demo-data';

const devices: DemoDevice[] = DEMO_DEVICES;

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

      <DataTable
        title="Dispositivos monitorados"
        description="Visão geral dos equipamentos vinculados ao ambiente do cliente."
      >
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
          {devices.map((device: DemoDevice) => (
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
      </DataTable>
    </div>
  );
}
