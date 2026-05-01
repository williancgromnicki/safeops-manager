'use server';

import {
  createAlertContact,
  deactivateAlertContact,
  listAlertContactsService,
  type CreateAlertContactInput,
  type DeactivateAlertContactInput,
  type ListAlertContactsInput,
  type UpdateAlertContactInput,
  updateAlertContact,
} from '@/lib/services/alert-contacts';

export async function listAlertContactsAction(input: ListAlertContactsInput = {}) {
  return listAlertContactsService(input);
}

export async function createAlertContactAction(input: CreateAlertContactInput) {
  return createAlertContact(input);
}

export async function updateAlertContactAction(input: UpdateAlertContactInput) {
  return updateAlertContact(input);
}

export async function deactivateAlertContactAction(input: DeactivateAlertContactInput) {
  return deactivateAlertContact(input);
}
