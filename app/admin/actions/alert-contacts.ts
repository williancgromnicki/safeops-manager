'use server';

import {
  listAlertContactsService,
  type ListAlertContactsInput,
} from '@/lib/services/alert-contacts';

export async function listAlertContactsAction(input: ListAlertContactsInput = {}) {
  return listAlertContactsService(input);
}
