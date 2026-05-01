import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { createClient } from '@/lib/supabase/server';

type AlertContactsPanelProps = {
  selectedCustomerId?: string;
};

type AlertContactRow = {
  id: string;
  customer: string;
  email: string;
  name: string;
  flags: string;
  isActive: boolean;
};


function getCustomerName(
  customer: { name: string | null } | { name: string | null }[] | null | undefined,
) {
  if (Array.isArray(customer)) {
    return customer[0]?.name ?? '—';
  }

  return customer?.name ?? '—';
}

function buildFlags(receivesInfo: boolean, receivesWarn: boolean, receivesCrit: boolean) {
  const flags = [
    receivesInfo ? 'INFO' : null,
    receivesWarn ? 'WARN' : null,
    receivesCrit ? 'CRIT' : null,
  ].filter(Boolean);

  return flags.length > 0 ? flags.join(' / ') : '—';
}

export async function AlertContactsPanel({ selectedCustomerId }: AlertContactsPanelProps) {
  const supabase = await createClient();

  let query = supabase
    .from('customer_alert_contacts')
    .select('id, email, name, receives_info, receives_warn, receives_crit, is_active, customer:customers(name)')
    .order('created_at', { ascending: false });

  if (selectedCustomerId) {
    query = query.eq('customer_id', selectedCustomerId);
  }

  const { data: contacts } = await query;

  const rows: AlertContactRow[] = (contacts ?? []).map((contact) => ({
    id: contact.id,
    customer: getCustomerName(contact.customer),
    email: contact.email,
    name: contact.name?.trim() || '—',
    flags: buildFlags(contact.receives_info, contact.receives_warn, contact.receives_crit),
    isActive: contact.is_active,
  }));

  return (
    <div className="space-y-3">
      <h3 className="section-title">Contatos de alerta</h3>
      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum contato de alerta cadastrado"
          description="Os contatos configurados para receber notificações dos clientes aparecerão aqui."
        />
      ) : (
        <DataTable columns={['Customer', 'E-mail', 'Nome', 'Flags (INFO/WARN/CRIT)', 'Ativo']}>
          {rows.map((row) => (
            <tr key={row.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{row.customer}</td>
              <td className="px-4 py-3">{row.email}</td>
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3">{row.flags}</td>
              <td className="px-4 py-3">{row.isActive ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
