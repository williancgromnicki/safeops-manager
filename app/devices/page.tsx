import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { DEMO_DEVICES } from '@/lib/demo-data';
import { createClient } from '@/lib/supabase/server';

export default async function DevicesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('devices')
    .select('id, name, status, metadata')
    .order('created_at', { ascending: false });

  const devices = data && data.length > 0
    ? data.map((device) => ({
        id: device.id,
        name: device.name,
        site: typeof device.metadata?.site === 'string' ? device.metadata.site : 'Sem localização',
        status:
          device.status === 'critical' ? 'Crítico' : device.status === 'warning' ? 'Atenção' : 'Saudável',
      }))
    : DEMO_DEVICES;

  return (
    <section className="space-y-6">
      <h2 className="section-title">Devices</h2>
      {devices.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo encontrado"
          description="Cadastre dispositivos para começar o monitoramento operacional."
        />
      ) : (
        <DataTable columns={['Dispositivo', 'Local', 'Status operacional']}>
          {devices.map((device) => (
            <tr key={device.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{device.name}</td>
              <td className="px-4 py-3">{device.site}</td>
              <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}
