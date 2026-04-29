import { redirect } from 'next/navigation';

import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const DEVICES = [
  { name: 'Sensor Pressão 01', site: 'Planta Sul', status: 'Saudável' as const },
  { name: 'PLC Linha B', site: 'Planta Norte', status: 'Atenção' as const },
  { name: 'Gateway OPC', site: 'Refinaria Leste', status: 'Crítico' as const },
];

export default async function DevicesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-6">
      <h2 className="section-title">Devices</h2>
      <DataTable columns={['Dispositivo', 'Local', 'Status operacional']}>
        {DEVICES.map((device) => (
          <tr key={device.name} className="text-slate-700">
            <td className="px-4 py-3 font-medium">{device.name}</td>
            <td className="px-4 py-3">{device.site}</td>
            <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
