-- Incremental policy hardening for customer_alert_contacts
-- Purpose: keep authenticated access scoped by user_customer_access and
-- allow service_role to manage records for server-side repository operations.

ALTER TABLE public.customer_alert_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_alert_contacts_insert_authenticated ON public.customer_alert_contacts;
CREATE POLICY customer_alert_contacts_insert_authenticated
    ON public.customer_alert_contacts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_customer_access AS uca
            WHERE uca.customer_id = customer_alert_contacts.customer_id
              AND uca.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS customer_alert_contacts_update_authenticated ON public.customer_alert_contacts;
CREATE POLICY customer_alert_contacts_update_authenticated
    ON public.customer_alert_contacts
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_customer_access AS uca
            WHERE uca.customer_id = customer_alert_contacts.customer_id
              AND uca.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_customer_access AS uca
            WHERE uca.customer_id = customer_alert_contacts.customer_id
              AND uca.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS customer_alert_contacts_service_role_manage_all ON public.customer_alert_contacts;
CREATE POLICY customer_alert_contacts_service_role_manage_all
    ON public.customer_alert_contacts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Rollback instructions:
-- 1) DROP POLICY IF EXISTS customer_alert_contacts_service_role_manage_all ON public.customer_alert_contacts;
-- 2) DROP POLICY IF EXISTS customer_alert_contacts_update_authenticated ON public.customer_alert_contacts;
-- 3) DROP POLICY IF EXISTS customer_alert_contacts_insert_authenticated ON public.customer_alert_contacts;
-- 4) (optional) keep existing SELECT policy untouched and preserve RLS enablement.
