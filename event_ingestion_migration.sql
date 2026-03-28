ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS external_event_id UUID,
    ADD COLUMN IF NOT EXISTS customer_id TEXT,
    ADD COLUMN IF NOT EXISTS external_edge_server_id TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS events_external_event_id_unique_idx
ON public.events (external_event_id)
WHERE external_event_id IS NOT NULL;
