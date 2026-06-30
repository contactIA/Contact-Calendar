-- ============================================================================
-- 0005 — Configuração de integração Helena por conta (white-label)
--
-- Contexto: cada clínica (account) tem sua PRÓPRIA conta Helena — token, canal
-- de envio e templates de WhatsApp são por tenant. Até aqui só existia um
-- HELENA_API_TOKEN global no .env, o que não serve para o white-label. Esta
-- migration cria a tabela 1:1 com accounts que guarda essas credenciais e as
-- preferências de mensageria (lembrete, etiquetas), configuráveis pelo admin.
--
-- As funcionalidades que dependem disso:
--   - sincronizar contato (sync_contacts)            — não exige template
--   - etiquetar por status (tag_*)                   — não exige template
--   - confirmação/lembrete (confirm/reminder_template_id) — exige template
-- Sem template configurado, a confirmação/lembrete simplesmente não dispara.
--
-- RLS: deny-all (habilitada sem policies). O token é segredo e só é acessível
-- via service_role no backend — nunca exposto ao cliente.
-- ============================================================================

CREATE TABLE public.account_integrations (
  account_id           uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Credenciais Helena (por clínica)
  helena_enabled       boolean NOT NULL DEFAULT false,
  helena_token         text,
  helena_channel       text,            -- número do canal cadastrado (campo "from")

  -- Mensageria proativa (exige template aprovado no canal)
  confirm_template_id  text,            -- template enviado na confirmação imediata
  reminder_template_id text,            -- template do lembrete agendado
  reminder_lead_hours  integer NOT NULL DEFAULT 24 CHECK (reminder_lead_hours >= 0),

  -- Sincronização de contato e etiquetas (não exigem template)
  sync_contacts        boolean NOT NULL DEFAULT true,
  tag_scheduled        text,            -- etiqueta aplicada ao agendar
  tag_completed        text,            -- etiqueta aplicada ao concluir
  tag_no_show          text,            -- etiqueta aplicada em falta (no_show)

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_integrations ENABLE ROW LEVEL SECURITY;
