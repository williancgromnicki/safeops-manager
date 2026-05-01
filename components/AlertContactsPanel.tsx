'use client';

import { useState, useTransition } from 'react';
import { createAlertContactAction, deactivateAlertContactAction, updateAlertContactAction } from '@/app/admin/actions/alert-contacts';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import type { AlertContactRecord } from '@/lib/repositories/alert-contacts-repository';
import type { AdminCustomerRecord } from '@/lib/repositories/admin-repository';

type AlertContactsPanelProps = {
  contacts: AlertContactRecord[];
  customers: AdminCustomerRecord[];
  canManage: boolean;
};

type FormState = {
  customerId: string;
  name: string;
  email: string;
  receivesInfo: boolean;
  receivesWarn: boolean;
  receivesCrit: boolean;
  isActive: boolean;
};

function BooleanBadge({ value }: { value: boolean }) {
  if (value) return <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓</span>;
  return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">—</span>;
}

function ActiveStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      {isActive ? 'Ativo' : 'Inativo'}
    </span>
  );
}

const DEFAULT_FORM: Omit<FormState, 'customerId'> = {
  name: '',
  email: '',
  receivesInfo: false,
  receivesWarn: true,
  receivesCrit: true,
  isActive: true,
};

export function AlertContactsPanel({ contacts, customers, canManage }: AlertContactsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingContact, setEditingContact] = useState<AlertContactRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({ customerId: customers[0]?.id ?? '', ...DEFAULT_FORM });

  const resetForm = () => {
    setEditingContact(null);
    setFormState({ customerId: customers[0]?.id ?? '', ...DEFAULT_FORM });
    setIsFormOpen(false);
  };

  const openCreate = () => {
    setMessage(null);
    setEditingContact(null);
    setFormState({ customerId: customers[0]?.id ?? '', ...DEFAULT_FORM });
    setIsFormOpen(true);
  };

  const openEdit = (contact: AlertContactRecord) => {
    setMessage(null);
    setEditingContact(contact);
    setIsFormOpen(true);
    setFormState({
      customerId: contact.customerId,
      name: contact.name ?? '',
      email: contact.email,
      receivesInfo: contact.receivesInfo,
      receivesWarn: contact.receivesWarn,
      receivesCrit: contact.receivesCrit,
      isActive: contact.isActive,
    });
  };

  const submitForm = () => {
    setMessage(null);
    if (!formState.email.trim()) {
      setMessage({ type: 'error', text: 'E-mail é obrigatório.' });
      return;
    }
    if (!editingContact && !formState.customerId) {
      setMessage({ type: 'error', text: 'Cliente é obrigatório na criação.' });
      return;
    }

    startTransition(async () => {
      try {
        if (editingContact) {
          await updateAlertContactAction({ id: editingContact.id, ...formState, name: formState.name || null });
          setMessage({ type: 'success', text: 'Contato atualizado com sucesso.' });
        } else {
          await createAlertContactAction({ ...formState, name: formState.name || null });
          setMessage({ type: 'success', text: 'Contato criado com sucesso.' });
        }
        resetForm();
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? `Erro ao salvar contato: ${error.message}` : 'Erro ao salvar contato.' });
      }
    });
  };

  const toggleStatus = (contact: AlertContactRecord) => {
    setMessage(null);
    startTransition(async () => {
      try {
        if (contact.isActive) {
          await deactivateAlertContactAction({ id: contact.id, customerId: contact.customerId });
          setMessage({ type: 'success', text: 'Contato desativado com sucesso.' });
        } else {
          await updateAlertContactAction({
            id: contact.id,
            customerId: contact.customerId,
            name: contact.name,
            email: contact.email,
            receivesInfo: contact.receivesInfo,
            receivesWarn: contact.receivesWarn,
            receivesCrit: contact.receivesCrit,
            isActive: true,
          });
          setMessage({ type: 'success', text: 'Contato ativado com sucesso.' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? `Erro ao alterar status: ${error.message}` : 'Erro ao alterar status.' });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="section-title">Contatos de alerta</h3>
        {canManage ? (
          <button type="button" onClick={openCreate} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Adicionar contato
          </button>
        ) : null}
      </div>

      {message ? <p className={`text-sm ${message.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p> : null}

      {isFormOpen ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">{editingContact ? 'Editar contato' : 'Novo contato'}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              Cliente
              <select
                disabled={Boolean(editingContact)}
                value={formState.customerId}
                onChange={(e) => setFormState((prev) => ({ ...prev, customerId: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:bg-slate-200"
              >
                <option value="">Selecione</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Nome
              <input value={formState.name} onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="text-sm text-slate-700 md:col-span-2">
              E-mail
              <input
                type="email"
                required
                value={formState.email}
                onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            {[
              ['receivesInfo', 'Recebe informativos'],
              ['receivesWarn', 'Recebe alertas'],
              ['receivesCrit', 'Recebe alertas críticos'],
              ['isActive', 'Ativo'],
            ].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState[key as keyof FormState] as boolean}
                  onChange={(e) => setFormState((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={isPending} onClick={submitForm} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              {editingContact ? 'Salvar edição' : 'Criar contato'}
            </button>
            <button type="button" disabled={isPending} onClick={resetForm} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState title="Nenhum contato de alerta cadastrado" description="Os contatos configurados para receber notificações de clientes aparecerão aqui." />
      ) : (
        <DataTable columns={['Cliente', 'Nome', 'E-mail', 'Recebe informativos', 'Recebe alertas', 'Recebe alertas críticos', 'Status', 'Ações']}>
          {contacts.map((contact) => (
            <tr key={contact.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">{contact.customerName}</td><td className="px-4 py-3">{contact.name?.trim() || '—'}</td><td className="px-4 py-3">{contact.email}</td>
              <td className="px-4 py-3"><BooleanBadge value={contact.receivesInfo} /></td><td className="px-4 py-3"><BooleanBadge value={contact.receivesWarn} /></td><td className="px-4 py-3"><BooleanBadge value={contact.receivesCrit} /></td>
              <td className="px-4 py-3"><ActiveStatusBadge isActive={contact.isActive} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEdit(contact)} className="rounded border border-slate-300 px-2 py-1 text-xs">Editar</button>
                  <button type="button" onClick={() => toggleStatus(contact)} className="rounded border border-slate-300 px-2 py-1 text-xs">
                    {contact.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
