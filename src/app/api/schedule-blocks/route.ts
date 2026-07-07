import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { addDays, format } from 'date-fns'
import { z } from 'zod'

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// GET /api/schedule-blocks?from&to — leitura aberta a todos os roles autenticados.
// Devolve os bloqueios (schedule_blocks) de TODOS os dentistas da conta no
// período + o expediente semanal (dentist_schedules), para a agenda desenhar
// faixas de bloqueio e sombrear o fora-de-expediente em uma única requisição.
export const GET = withAuth(async (req, ctx) => {
  const qp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = listSchema.safeParse(qp)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  // Blocos ficam em UTC e o dia local (UTC-3) atravessa a fronteira do dia
  // UTC — busca com 1 dia de folga em cada ponta; o client recorta por dia.
  const noon = (d: string) => new Date(`${d}T12:00:00Z`)
  const fromPad = format(addDays(noon(parsed.data.from), -1), 'yyyy-MM-dd')
  const toPad   = format(addDays(noon(parsed.data.to),    1), 'yyyy-MM-dd')

  const [blocksRes, schedulesRes] = await Promise.all([
    supabaseAdmin
      .from('schedule_blocks')
      .select('id, dentist_id, unit_id, start_at, end_at, type')
      .eq('account_id', ctx.user.accountId)
      .gte('end_at', `${fromPad}T00:00:00Z`)
      .lte('start_at', `${toPad}T23:59:59Z`)
      .order('start_at'),
    supabaseAdmin
      .from('dentist_schedules')
      .select('id, dentist_id, unit_id, day_of_week, start_time, end_time')
      .eq('account_id', ctx.user.accountId)
      .order('day_of_week'),
  ])

  if (blocksRes.error)    return err(blocksRes.error.message, 500)
  if (schedulesRes.error) return err(schedulesRes.error.message, 500)

  return ok({ blocks: blocksRes.data, schedules: schedulesRes.data })
})
