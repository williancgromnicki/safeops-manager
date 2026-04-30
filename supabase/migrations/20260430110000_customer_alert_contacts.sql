CREATE TABLE public.customer_alert_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    receives_info BOOLEAN NOT NULL DEFAULT FALSE,
    receives_warn BOOLEAN NOT NULL DEFAULT TRUE,
    receives_crit BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_alert_contacts_customer_email_unique UNIQUE (customer_id, email)
);

CREATE INDEX idx_customer_alert_contacts_customer_id
    ON public.customer_alert_contacts (customer_id);

CREATE INDEX idx_customer_alert_contacts_customer_id_is_active
    ON public.customer_alert_contacts (customer_id, is_active);

ALTER TABLE public.customer_alert_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_alert_contacts_select_authenticated
    ON public.customer_alert_contacts
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_customer_access AS uca
            WHERE uca.customer_id = customer_alert_contacts.customer_id
              AND uca.user_id = auth.uid()
        )
    );
