import { createClient } from '@/lib/supabase/server';
import {
  activateAlertContact as activateAlertContactRepository,
  createAlertContact as createAlertContactRepository,
  deactivateAlertContact as deactivateAlertContactRepository,
  listAlertContacts,
  updateAlertContact as updateAlertContactRepository,
  type AlertContactRecord,
} from '@/lib/repositories/alert-contacts-repository';
import { writeAuditLog } from '@/lib/repositories/log-repository';

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

type AuditAction =
  | 'alert_contact_created'
  | 'alert_contact_updated'
  | 'alert_contact_enabled'
  | 'alert_contact_disabled';

type AuditContext = Record<string, unknown>;

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

function contactAuditContext(
  contact: AlertContactRecord,
  extra?: AuditContext,
): AuditContext {
  return {
    email: contact.email,
    name: contact.name,
    receivesInfo: contact.receivesInfo,
    receivesWarn: contact.receivesWarn,
    receivesCrit: contact.receivesCrit,
    isActive: contact.isActive,
    ...(extra ?? {}),
  };
}

async function writeAuditLogSafely(input: {
  userId: string;
  customerId: string;
  contactId: string;
  action: AuditAction;
  context?: AuditContext;
}) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
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
  const { userId } = await requireAuthenticatedAdmin(input.customerId);

  const email = validateEmail(input.email);
  validatePermissions(input);

  const createdContact = await createAlertContactRepository({
    customerId: input.customerId,
    email,
    name: input.name ?? null,
    receivesInfo: input.receivesInfo,
    receivesWarn: input.receivesWarn,
    receivesCrit: input.receivesCrit,
    isActive: input.isActive ?? true,
  });

  await writeAuditLogSafely({
    userId,
    customerId: createdContact.customerId,
    contactId: createdContact.id,
    action: 'alert_contact_created',
    context: contactAuditContext(createdContact),
  });

  return createdContact;
}

export async function updateAlertContact(
  input: UpdateAlertContactInput,
): Promise<AlertContactRecord> {
  const { userId } = await requireAuthenticatedAdmin(input.customerId);

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
    isActive: input.isActive,
  });

  await writeAuditLogSafely({
    userId,
    customerId: updatedContact.customerId,
    contactId: updatedContact.id,
    action: 'alert_contact_updated',
    context: contactAuditContext(updatedContact),
  });

  return updatedContact;
}

export async function deactivateAlertContact(
  input: DeactivateAlertContactInput,
): Promise<AlertContactRecord> {
  const { userId } = await requireAuthenticatedAdmin(input.customerId);

  const deactivatedContact = await deactivateAlertContactRepository(
    input.id,
    input.customerId,
  );

  await writeAuditLogSafely({
    userId,
    customerId: deactivatedContact.customerId,
    contactId: deactivatedContact.id,
    action: 'alert_contact_disabled',
    context: contactAuditContext(deactivatedContact, {
      source: 'toggle_alert_contact',
    }),
  });

  return deactivatedContact;
}

export async function activateAlertContact(
  input: ActivateAlertContactInput,
): Promise<AlertContactRecord> {
  const { userId } = await requireAuthenticatedAdmin(input.customerId);

  const activatedContact = await activateAlertContactRepository(
    input.id,
    input.customerId,
  );

  await writeAuditLogSafely({
    userId,
    customerId: activatedContact.customerId,
    contactId: activatedContact.id,
    action: 'alert_contact_enabled',
    context: contactAuditContext(activatedContact, {
      source: 'toggle_alert_contact',
    }),
  });

  return activatedContact;
}
