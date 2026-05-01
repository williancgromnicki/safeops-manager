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
  receivesInfo: boolean;
  receivesWarn: boolean;
  receivesCrit: boolean;
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

function BooleanBadge({ value }: { value: boolean }) {
  if (value) {
    return <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓</span>;
  }

  return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">—</span>;
}

function ActiveStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {isActive ? 'Ativo' : 'Inativo'}
    </span>
  );
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

  const { data: contacts, error } = await query;

  if (error) {
    return (
      <div className="space-y-3">
        <h3 className="section-title">Contatos de alerta</h3>
        <EmptyState
          title="Erro ao carregar contatos"
          description="Não foi possível carregar os contatos de alerta no momento. Tente novamente em alguns instantes."
        />
      </div>
    );
  }

  const rows: AlertContactRow[] = (contacts ?? []).map((contact) => ({
    id: contact.id,
    customer: getCustomerName(contact.customer),
    email: contact.email,
    name: contact.name?.trim() || '—',
    receivesInfo: contact.receives_info,
    receivesWarn: contact.receives_warn,
    receivesCrit: contact.receives_crit,
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
        <DataTable columns={['Cliente', 'Nome', 'E-mail', 'Recebe INFO', 'Recebe WARN', 'Recebe CRIT', 'Status']}>
          {rows.map((row) => (
            <tr key={row.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{row.customer}</td>
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3">{row.email}</td>
              <td className="px-4 py-3">
                <BooleanBadge value={row.receivesInfo} />
              </td>
              <td className="px-4 py-3">
                <BooleanBadge value={row.receivesWarn} />
              </td>
              <td className="px-4 py-3">
                <BooleanBadge value={row.receivesCrit} />
              </td>
              <td className="px-4 py-3">
                <ActiveStatusBadge isActive={row.isActive} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
