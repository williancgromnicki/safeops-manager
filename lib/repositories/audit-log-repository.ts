import { getSupabaseAdmin } from '@/lib/supabase/admin';

type WriteAuditLogInput = {
  userId: string;
  customerId: string;
  contactId: string;
  action:
    | 'alert_contact_created'
    | 'alert_contact_updated'
    | 'alert_contact_enabled'
    | 'alert_contact_disabled';
  context?: Record<string, unknown>;
};

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const supabase = getSupabaseAdmin();

  const occurredAt = new Date().toISOString();

  const { error } = await supabase.from('audit_log').insert({
    customer_id: input.customerId,
    user_id: input.userId,
    action: input.action,
    entity_type: 'alert_contact',
    entity_id: input.contactId,
    occurred_at: occurredAt,
    payload: {
      userId: input.userId,
      customerId: input.customerId,
      contactId: input.contactId,
      occurredAt,
      ...(input.context ?? {}),
    },
  });

  if (error) {
    throw new Error(`Failed to write audit log: ${error.message}`);
  }
}
