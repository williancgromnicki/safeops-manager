'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  createAlertContactAction,
  toggleAlertContactAction,
  updateAlertContactAction,
} from '@/app/admin/actions/alert-contacts';
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

type FeedbackMessage = {
  type: 'success' | 'error';
  text: string;
};

const DEFAULT_FORM: Omit<FormState, 'customerId'> = {
  name: '',
  email: '',
  receivesInfo: false,
  receivesWarn: true,
  receivesCrit: true,
  isActive: true,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function BooleanBadge({ value }: { value: boolean }) {
  if (value) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        ✓
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      —
    </span>
  );
}

function ActiveStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {isActive ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function toFormData(data: Record<string, string | boolean | null | undefined>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    formData.set(key, typeof value === 'boolean' ? String(value) : value);
  }

  return formData;
}

export function AlertContactsPanel({
  contacts,
  customers,
  canManage,
}: AlertContactsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [contactsState, setContactsState] =
    useState<AlertContactRecord[]>(contacts);

  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [editingContact, setEditingContact] =
    useState<AlertContactRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    customerId: customers[0]?.id ?? '',
    ...DEFAULT_FORM,
  });

  useEffect(() => {
    setContactsState(contacts);
  }, [contacts]);

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

  const validateForm = () => {
    if (!editingContact && !formState.customerId) {
      setMessage({ type: 'error', text: 'Cliente é obrigatório na criação.' });
      return false;
    }

    if (!formState.email.trim()) {
      setMessage({ type: 'error', text: 'E-mail é obrigatório.' });
      return false;
    }

    if (!EMAIL_REGEX.test(formState.email.trim().toLowerCase())) {
      setMessage({ type: 'error', text: 'Informe um e-mail válido.' });
      return false;
    }

    if (
      !formState.receivesInfo &&
      !formState.receivesWarn &&
      !formState.receivesCrit
    ) {
      setMessage({
        type: 'error',
        text: 'Selecione ao menos um tipo de notificação.',
      });
      return false;
    }

    return true;
  };

  const submitForm = () => {
    setMessage(null);

    if (!validateForm()) {
      return;
    }

    startTransition(async () => {
      try {
        if (editingContact) {
          const formData = toFormData({
            id: editingContact.id,
            customerId: editingContact.customerId,
            name: formState.name || null,
            email: formState.email,
            receivesInfo: formState.receivesInfo,
            receivesWarn: formState.receivesWarn,
            receivesCrit: formState.receivesCrit,
            isActive: formState.isActive,
          });

          await updateAlertContactAction(formData);

          setContactsState((current) =>
            current.map((contact) =>
              contact.id === editingContact.id
                ? {
                    ...contact,
                    name: formState.name || null,
                    email: formState.email.trim().toLowerCase(),
                    receivesInfo: formState.receivesInfo,
                    receivesWarn: formState.receivesWarn,
                    receivesCrit: formState.receivesCrit,
                    isActive: formState.isActive,
                  }
                : contact,
            ),
          );

          setMessage({
            type: 'success',
            text: 'Contato atualizado com sucesso.',
          });
        } else {
          const selectedCustomer = customers.find(
            (customer) => customer.id === formState.customerId,
          );

          const formData = toFormData({
            customerId: formState.customerId,
            name: formState.name || null,
            email: formState.email,
            receivesInfo: formState.receivesInfo,
            receivesWarn: formState.receivesWarn,
            receivesCrit: formState.receivesCrit,
            isActive: formState.isActive,
          });

          cconst result = await createAlertContactAction(formData);

if (result && 'success' in result && result.success === false) {
  throw new Error(result.message || 'Não foi possível criar o contato.');
}

setMessage({
  type: 'success',
  text:
    result && 'message' in result && result.message
      ? result.message
      : 'Contato criado com sucesso.',
});

        resetForm();
        router.refresh();
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error
              ? `Erro ao salvar contato: ${error.message}`
              : 'Erro ao salvar contato.',
        });
      }
    });
  };

  const toggleStatus = (contact: AlertContactRecord) => {
    setMessage(null);

    const nextIsActive = !contact.isActive;
    const previousContacts = contactsState;

    setContactsState((current) =>
      current.map((item) =>
        item.id === contact.id
          ? {
              ...item,
              isActive: nextIsActive,
            }
          : item,
      ),
    );

    if (editingContact?.id === contact.id) {
      setEditingContact({
        ...editingContact,
        isActive: nextIsActive,
      });

      setFormState((current) => ({
        ...current,
        isActive: nextIsActive,
      }));
    }

    startTransition(async () => {
      try {
        const formData = toFormData({
          id: contact.id,
          customerId: contact.customerId,
          name: contact.name,
          email: contact.email,
          receivesInfo: contact.receivesInfo,
          receivesWarn: contact.receivesWarn,
          receivesCrit: contact.receivesCrit,
          isActive: contact.isActive,
        });

        await toggleAlertContactAction(formData);

        setMessage({
          type: 'success',
          text: nextIsActive
            ? 'Contato ativado com sucesso.'
            : 'Contato desativado com sucesso.',
        });

        router.refresh();
      } catch (error) {
        setContactsState(previousContacts);

        if (editingContact?.id === contact.id) {
          setEditingContact(contact);

          setFormState((current) => ({
            ...current,
            isActive: contact.isActive,
          }));
        }

        setMessage({
          type: 'error',
          text:
            error instanceof Error
              ? `Erro ao alterar status: ${error.message}`
              : 'Erro ao alterar status.',
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="section-title">Contatos de alerta</h3>

        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            disabled={isPending}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Adicionar contato
          </button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {isFormOpen ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">
            {editingContact ? 'Editar contato' : 'Novo contato'}
          </h4>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              Cliente
              <select
                disabled={Boolean(editingContact) || isPending}
                value={formState.customerId}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    customerId: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:bg-slate-200"
              >
                <option value="">Selecione</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Nome
              <input
                value={formState.name}
                disabled={isPending}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>

            <label className="text-sm text-slate-700 md:col-span-2">
              E-mail
              <input
                type="email"
                required
                value={formState.email}
                disabled={isPending}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
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
                  disabled={isPending}
                  checked={formState[key as keyof FormState] as boolean}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submitForm}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {editingContact ? 'Salvar edição' : 'Criar contato'}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={resetForm}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {contactsState.length === 0 ? (
        <EmptyState
          title="Nenhum contato de alerta cadastrado"
          description="Os contatos configurados para receber notificações de clientes aparecerão aqui."
        />
      ) : (
        <DataTable
          columns={[
            'Cliente',
            'Nome',
            'E-mail',
            'Recebe informativos',
            'Recebe alertas',
            'Recebe alertas críticos',
            'Status',
            'Ações',
          ]}
        >
          {contactsState.map((contact) => (
            <tr key={contact.id} className="text-slate-700">
              <td className="px-4 py-3 font-medium">
                {contact.customerName}
              </td>
              <td className="px-4 py-3">
                {contact.name?.trim() || '—'}
              </td>
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
              <td className="px-4 py-3">
                {canManage ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => openEdit(contact)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggleStatus(contact)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {contact.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Somente leitura</span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
