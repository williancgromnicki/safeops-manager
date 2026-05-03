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

  const { error } = await supabase.from('audit_log').insert({
    user_id: input.userId,
    customer_id: input.customerId,
    action: input.action,
    target_type: 'customer_alert_contact',
    target_id: input.contactId,
    metadata: {
      userId: input.userId,
      customerId: input.customerId,
      contactId: input.contactId,
      ...(input.context ?? {}),
    },
  });

  if (error) {
    throw new Error(`Failed to write audit log: ${error.message}`);
  }
}
