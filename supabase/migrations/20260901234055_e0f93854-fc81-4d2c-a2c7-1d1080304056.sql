ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_base64 TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS orders_payment_reference_idx ON public.orders(payment_reference);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id TEXT NOT NULL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'onipay',
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;