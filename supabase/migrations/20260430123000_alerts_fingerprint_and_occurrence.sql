ALTER TABLE public.alerts
    ADD COLUMN fingerprint text NULL;

ALTER TABLE public.alerts
    ADD COLUMN last_seen_at timestamptz NULL;

ALTER TABLE public.alerts
    ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.alerts
    ADD COLUMN closed_by_event_id uuid NULL;

UPDATE public.alerts
SET last_seen_at = occurred_at
WHERE last_seen_at IS NULL;

UPDATE public.alerts
SET occurrence_count = 1
WHERE occurrence_count IS DISTINCT FROM 1;

CREATE INDEX idx_alerts_open_fingerprint
    ON public.alerts (customer_id, device_id, fingerprint, status);
