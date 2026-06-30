import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

// account_integrations ainda não está nos tipos gerados (migration 0005).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any

// Campos não-secretos retornados ao admin. O token NUNCA é devolvido — só
// sinalizamos se já existe um configurado (helena_token_set).
const PUBLIC_FIELDS = `
  account_id, helena_enabled, helena_channel,
  confirm_template_id, reminder_template_id, reminder_lead_hours,
  sync_contacts, tag_scheduled, tag_completed, tag_no_show,
  panel_id, step_mappings, updated_at
`

const updateSchema = z.object({
  helena_enabled:       z.boolean().optional(),
  helena_token:         z.string().min(1).nullable().optional(),
  helena_channel:       z.string().min(1).nullable().optional(),
  confirm_template_id:  z.string().min(1).nullable().optional(),
  reminder_template_id: z.string().min(1).nullable().optional(),
  reminder_lead_hours:  z.number().int().min(0).max(720).optional(),
  sync_contacts:        z.boolean().optional(),
  tag_scheduled:        z.string().min(1).nullable().optional(),
  tag_completed:        z.string().min(1).nullable().optional(),
  tag_no_show:          z.string().min(1).nullable().optional(),
  panel_id:             z.string().uuid().nullable().optional(),
  step_mappings:        z.record(z.string(), z.string()).optional(),
})

// GET /api/admin/integrations — config da integração Helena da conta (sem o token)
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await db
    .from('account_integrations')
    .select(PUBLIC_FIELDS)
    .eq('account_id', ctx.user.accountId)
    .maybeSingle()

  if (error) return err(error.message, 500)

  // Sem linha ainda: devolve defaults com tudo desligado.
  if (!data) {
    return ok({
      account_id: ctx.user.accountId,
      helena_enabled: false,
      helena_channel: null,
      confirm_template_id: null,
      reminder_template_id: null,
      reminder_lead_hours: 24,
      sync_contacts: true,
      tag_scheduled: null,
      tag_completed: null,
      tag_no_show: null,
      helena_token_set: false,
      panel_id: null,
      step_mappings: {},
    })
  }

  const { data: tokenRow } = await db
    .from('account_integrations')
    .select('helena_token')
    .eq('account_id', ctx.user.accountId)
    .maybeSingle()

  return ok({ ...data, helena_token_set: !!tokenRow?.helena_token })
}, ['admin'])

// PUT /api/admin/integrations — cria/atualiza a config (upsert). Só grava os
// campos enviados; o token só é alterado quando vier explicitamente no corpo.
export const PUT = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  if (Object.keys(parsed.data).length === 0) {
    return err('Nenhum campo para atualizar', 400)
  }

  const payload = {
    account_id: ctx.user.accountId,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('account_integrations')
    .upsert(payload, { onConflict: 'account_id' })
    .select(PUBLIC_FIELDS)
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])
