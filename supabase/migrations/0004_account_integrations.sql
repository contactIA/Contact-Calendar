-- TASK-002: tabela de integrações por conta (secrets multi-tenant)
-- Decisão PEND-2: criptografia no app layer (AES-256-GCM via Node crypto).
-- Nenhuma extensão extra necessária. A chave fica em INTEGRATIONS_ENCRYPTION_KEY.
-- RLS habilitado sem policies: leitura exclusiva via service_role (supabaseAdmin).

CREATE TABLE public.account_integrations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider    text        NOT NULL CHECK (provider IN ('helena', 'clinicorp')),
  secrets     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  panel_id    text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Garante 1 integração por provedor por conta
CREATE UNIQUE INDEX uq_account_provider
  ON public.account_integrations (account_id, provider);

CREATE INDEX idx_integrations_account
  ON public.account_integrations (account_id, is_active);

-- Nenhuma policy criada: o navegador nunca lê esta tabela.
-- O servidor acessa via service_role que bypassa RLS por padrão no Supabase.
ALTER TABLE public.account_integrations ENABLE ROW LEVEL SECURITY;
