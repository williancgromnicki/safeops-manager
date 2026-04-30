import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import {
  DEMO_DEVICES,
  type DemoDevice,
  type OperationalStatus,
} from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

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

function normalizeStatus(status: string | null): OperationalStatus {
  if (status === 'online') return 'online';
  if (status === 'offline') return 'offline';
  if (status === 'attention') return 'attention';
  return 'unknown';
}

export default async function DevicesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from('devices')
    .select(
      'id, hostname, site, status, operating_system, last_seen_at, active_alerts',
    )
    .order('hostname', { ascending: true });

  const devices: DemoDevice[] =
    data && data.length > 0
      ? data.map((device): DemoDevice => ({
          id: device.id,
          customerId: user.id,
          name: device.hostname,
          site: device.site ?? 'Não informado',
          status: normalizeStatus(device.status),
          operatingSystem: device.operating_system ?? 'Não informado',
          lastSeen: device.last_seen_at
            ? new Date(device.last_seen_at).toLocaleString('pt-BR')
            : 'Sem informação recente',
          activeAlerts: device.active_alerts ?? 0,
        }))
      : DEMO_DEVICES;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Dispositivos</h2>

      {devices.length === 0 ? (
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
          {devices.map((device) => (
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
