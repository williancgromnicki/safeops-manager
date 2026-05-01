'use server';

import { revalidatePath } from 'next/cache';

import {
  activateAlertContact,
  createAlertContact,
  deactivateAlertContact,
  listAlertContactsService,
  type ListAlertContactsInput,
  updateAlertContact,
} from '@/lib/services/alert-contacts';

export async function listAlertContactsAction(input: ListAlertContactsInput = {}) {
  return listAlertContactsService(input);
}

type AlertContactActionState = {
  success: boolean;
  message: string;
};

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getBooleanField(formData: FormData, key: string): boolean {
  const value = formData.get(key);

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === 'on' || normalized === 'true' || normalized === '1';
}

function buildBaseInput(formData: FormData) {
  const customerId = getStringField(formData, 'customerId');
  const id = getStringField(formData, 'id');

  if (!customerId) {
    throw new Error('Informe o cliente do contato.');
  }

  return { id, customerId };
}

function buildUpsertInput(formData: FormData) {
  const { id, customerId } = buildBaseInput(formData);
  const email = getStringField(formData, 'email');

  if (!email) {
    throw new Error('Informe um e-mail válido.');
  }

  return {
    id,
    customerId,
    email,
    name: getStringField(formData, 'name') || null,
    receivesInfo: getBooleanField(formData, 'receivesInfo'),
    receivesWarn: getBooleanField(formData, 'receivesWarn'),
    receivesCrit: getBooleanField(formData, 'receivesCrit'),
    isActive: getBooleanField(formData, 'isActive'),
  };
}

function toUiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Informe')) {
      return error.message;
    }

    if (error.message.toLowerCase().includes('validation')) {
      return 'Verifique os dados informados e tente novamente.';
    }
  }

  return 'Não foi possível concluir a operação no momento.';
}

export async function createAlertContactAction(
  formData: FormData,
): Promise<AlertContactActionState> {
  try {
    const input = buildUpsertInput(formData);
    await createAlertContact(input);
    revalidatePath('/admin');

    return {
      success: true,
      message: 'Contato criado com sucesso.',
    };
  } catch (error) {
    return {
      success: false,
      message: toUiErrorMessage(error),
    };
  }
}

export async function updateAlertContactAction(
  formData: FormData,
): Promise<AlertContactActionState> {
  try {
    const input = buildUpsertInput(formData);

    if (!input.id) {
      throw new Error('Contato inválido para atualização.');
    }

    await updateAlertContact(input);
    revalidatePath('/admin');

    return {
      success: true,
      message: 'Contato atualizado com sucesso.',
    };
  } catch (error) {
    return {
      success: false,
      message: toUiErrorMessage(error),
    };
  }
}

export async function toggleAlertContactAction(
  formData: FormData,
): Promise<AlertContactActionState> {
  try {
    const { id, customerId } = buildBaseInput(formData);
    const isActive = getBooleanField(formData, 'isActive');

    if (!id) {
      throw new Error('Contato inválido para alteração de status.');
    }

    if (isActive) {
      await deactivateAlertContact({ id, customerId });
    } else {
      await activateAlertContact({ id, customerId });
    }

    revalidatePath('/admin');

    return {
      success: true,
      message: isActive
        ? 'Contato desativado com sucesso.'
        : 'Contato ativado com sucesso.',
    };
  } catch (error) {
    return {
      success: false,
      message: toUiErrorMessage(error),
    };
  }
}
