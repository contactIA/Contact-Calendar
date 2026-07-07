import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { getHelenaTokenForAccount, listTags } from '@/lib/helena'
import { z } from 'zod'

// Vínculo de tags Helena → significado (TASK-013). As tags vivem na Helena
// (pré-criadas manualmente, ADR 8); a tabela tag_links guarda o que cada UUID
// significa: família unit/crc/channel + significado (+ unit_id quando unidade).

export type TagFamily = 'unit' | 'crc' | 'channel'

const LINK_FIELDS = 'helena_tag_id, family, meaning, unit_id'

// GET /api/admin/integrations/helena/tags
// Tags da Helena (via listTags) já mescladas com os vínculos salvos da conta.
export const GET = withAuth(async (_req, ctx) => {
  const token = await getHelenaTokenForAccount(ctx.user.accountId)
  if (!token) return err('Configure o token da Helena primeiro', 400)

  const { data: links, error } = await supabaseAdmin
    .from('tag_links')
    .select(LINK_FIELDS)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)

  try {
    const tags = await listTags(token)
    const byTagId = new Map((links ?? []).map(l => [l.helena_tag_id, l]))
    const data = tags.map(t => {
      const link = byTagId.get(t.id)
      return {
        id:      t.id,
        name:    t.name,
        family:  (link?.family as TagFamily | undefined) ?? null,
        meaning: link?.meaning ?? null,
        unit_id: link?.unit_id ?? null,
      }
    })
    return ok({ data })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Falha ao consultar a Helena', 502)
  }
}, ['admin'])

// .uuid() do Zod 4 valida RFC-4122 estrito e rejeita os IDs do seed
// (versão/variante zeradas) — mesmo motivo do UUID_RE em slots/available.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const linkSchema = z.object({
  helena_tag_id: z.string().min(1),
  family:        z.enum(['unit', 'crc', 'channel']).nullable(),
  meaning:       z.string().trim().min(1).nullable().optional(),
  unit_id:       z.string().regex(UUID_RE, 'Invalid UUID').nullable().optional(),
})

const putSchema = z.object({
  links: z.array(linkSchema).min(1).max(500),
})

// PUT /api/admin/integrations/helena/tags
// Persiste os vínculos enviados: family preenchida → upsert; family null →
// remove o vínculo daquela tag. Tags não presentes no corpo ficam intactas.
export const PUT = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const accountId = ctx.user.accountId
  const toUnlink = parsed.data.links.filter(l => l.family === null)
  const toUpsert = parsed.data.links.filter(l => l.family !== null)

  // unit_id só vale para family = 'unit' e precisa ser unidade DA CONTA
  const { data: accountUnits, error: unitsError } = await supabaseAdmin
    .from('units')
    .select('id, name')
    .eq('account_id', accountId)
  if (unitsError) return err(unitsError.message, 500)
  const unitNames = new Map((accountUnits ?? []).map(u => [u.id, u.name]))

  const rows = []
  for (const link of toUpsert) {
    if (link.family === 'unit') {
      if (!link.unit_id) return err(`Escolha a unidade para a tag ${link.helena_tag_id}`, 400)
      if (!unitNames.has(link.unit_id)) return err('Unidade não pertence a esta conta', 400)
      rows.push({
        account_id:    accountId,
        helena_tag_id: link.helena_tag_id,
        family:        link.family,
        meaning:       link.meaning ?? unitNames.get(link.unit_id)!,
        unit_id:       link.unit_id,
        updated_at:    new Date().toISOString(),
      })
    } else {
      if (!link.meaning) return err(`Informe o significado da tag ${link.helena_tag_id}`, 400)
      rows.push({
        account_id:    accountId,
        helena_tag_id: link.helena_tag_id,
        family:        link.family!,
        meaning:       link.meaning,
        unit_id:       null,
        updated_at:    new Date().toISOString(),
      })
    }
  }

  if (toUnlink.length > 0) {
    const { error } = await supabaseAdmin
      .from('tag_links')
      .delete()
      .eq('account_id', accountId)
      .in('helena_tag_id', toUnlink.map(l => l.helena_tag_id))
    if (error) return err(error.message, 500)
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('tag_links')
      .upsert(rows, { onConflict: 'account_id,helena_tag_id' })
    if (error) return err(error.message, 500)
  }

  const { data: links, error: readError } = await supabaseAdmin
    .from('tag_links')
    .select(LINK_FIELDS)
    .eq('account_id', accountId)
  if (readError) return err(readError.message, 500)

  return ok({ data: links })
}, ['admin'])
