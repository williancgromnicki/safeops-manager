import { createClient } from '@/lib/supabase/server';
import {
  activateAlertContact as activateAlertContactRepository,
  createAlertContact as createAlertContactRepository,
  deactivateAlertContact as deactivateAlertContactRepository,
  listAlertContacts,
  updateAlertContact as updateAlertContactRepository,
  type AlertContactRecord,
} from '@/lib/repositories/alert-contacts-repository';

type UserProfile = {
  role: string | null;
};

type AlertPermissionFlags = {
  receivesInfo: boolean;
  receivesWarn: boolean;
  receivesCrit: boolean;
};

export type ListAlertContactsInput = {
  customerId?: string;
};

export type CreateAlertContactInput = {
  customerId: string;
  email: string;
  name?: string | null;
  isActive?: boolean;
} & AlertPermissionFlags;

export type UpdateAlertContactInput = {
  id: string;
  customerId: string;
  email: string;
  name?: string | null;
  isActive?: boolean;
} & AlertPermissionFlags;

export type DeactivateAlertContactInput = {
  id: string;
  customerId: string;
};

export type ActivateAlertContactInput = {
  id: string;
  customerId: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error('Validation error: invalid e-mail format.');
  }

  return normalized;
}

function validatePermissions(flags: AlertPermissionFlags): void {
  if (!flags.receivesInfo && !flags.receivesWarn && !flags.receivesCrit) {
    throw new Error('Validation error: at least one permission must be active.');
  }
}

async function requireAdminAndGetAllowedCustomers(
  userId: string,
): Promise<string[]> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<UserProfile>();

  if (profileError) {
    throw new Error(`Failed to verify admin profile: ${profileError.message}`);
  }

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: admin role is required.');
  }

  const { data: accesses, error } = await supabase
    .from('user_customer_access')
    .select('customer_id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to verify customer access: ${error.message}`);
  }

  return (accesses ?? []).map((item) => item.customer_id as string);
}

async function requireAuthenticatedAdmin(
  customerId?: string,
): Promise<{ userId: string; allowedCustomerIds: string[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized: user not authenticated.');
  }

  const allowedCustomerIds = await requireAdminAndGetAllowedCustomers(user.id);

  if (customerId && !allowedCustomerIds.includes(customerId)) {
    throw new Error('Forbidden: no access to this customer.');
  }

  return {
    userId: user.id,
    allowedCustomerIds,
  };
}

export async function listAlertContactsService(
  input: ListAlertContactsInput = {},
): Promise<AlertContactRecord[]> {
  const { allowedCustomerIds } = await requireAuthenticatedAdmin(
    input.customerId,
  );

  const targetCustomerIds = input.customerId
    ? [input.customerId]
    : allowedCustomerIds;

  if (targetCustomerIds.length === 0) {
    return [];
  }

  return listAlertContacts(targetCustomerIds);
}

export async function createAlertContact(
  input: CreateAlertContactInput,
): Promise<AlertContactRecord> {
  await requireAuthenticatedAdmin(input.customerId);

  const email = validateEmail(input.email);
  validatePermissions(input);

  return createAlertContactRepository({
    customerId: input.customerId,
    email,
    name: input.name ?? null,
    receivesInfo: input.receivesInfo,
    receivesWarn: input.receivesWarn,
    receivesCrit: input.receivesCrit,
  });
}

export async function updateAlertContact(
  input: UpdateAlertContactInput,
): Promise<AlertContactRecord> {
  await requireAuthenticatedAdmin(input.customerId);

  const email = validateEmail(input.email);
  validatePermissions(input);

  const updatedContact = await updateAlertContactRepository({
    id: input.id,
    customerId: input.customerId,
    email,
    name: input.name ?? null,
    receivesInfo: input.receivesInfo,
    receivesWarn: input.receivesWarn,
    receivesCrit: input.receivesCrit,
  });

  if (typeof input.isActive !== 'boolean' || updatedContact.isActive === input.isActive) {
    return updatedContact;
  }

  if (input.isActive) {
    return activateAlertContactRepository(input.id, input.customerId);
  }

  return deactivateAlertContactRepository(input.id, input.customerId);
}

export async function deactivateAlertContact(
  input: DeactivateAlertContactInput,
): Promise<AlertContactRecord> {
  await requireAuthenticatedAdmin(input.customerId);

  return deactivateAlertContactRepository(input.id, input.customerId);
}

export async function activateAlertContact(
  input: ActivateAlertContactInput,
): Promise<AlertContactRecord> {
  await requireAuthenticatedAdmin(input.customerId);

  return activateAlertContactRepository(input.id, input.customerId);
}
