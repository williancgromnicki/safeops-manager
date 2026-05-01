import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import type { AlertContactRecord } from '@/lib/repositories/alert-contacts-repository';
import type { AdminCustomerRecord } from '@/lib/repositories/admin-repository';

type AlertContactsPanelProps = {
  contacts: AlertContactRecord[];
  customers: AdminCustomerRecord[];
  canManage: boolean;
};

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

export function AlertContactsPanel({ contacts }: AlertContactsPanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="section-title">Contatos de alerta</h3>
      {contacts.length === 0 ? (
        <EmptyState
          title="Nenhum contato de alerta cadastrado"
          description="Os contatos configurados para receber notificações de clientes aparecerão aqui."
        />
      ) : (
        <DataTable columns={['Cliente', 'Nome', 'E-mail', 'Recebe informativos', 'Recebe alertas', 'Recebe alertas críticos', 'Status']}>
          {contacts.map((contact) => (
            <tr key={contact.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{contact.customerName}</td>
              <td className="px-4 py-3">{contact.name?.trim() || '—'}</td>
              <td className="px-4 py-3">{contact.email}</td>
              <td className="px-4 py-3">
                <BooleanBadge value={contact.receivesInfo} />
              </td>
              <td className="px-4 py-3">
                <BooleanBadge value={contact.receivesWarn} />
              </td>
              <td className="px-4 py-3">
                <BooleanBadge value={contact.receivesCrit} />
              </td>
              <td className="px-4 py-3">
                <ActiveStatusBadge isActive={contact.isActive} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
