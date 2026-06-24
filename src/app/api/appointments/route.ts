import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  patient_id:       z.string().uuid(),
  dentist_id:       z.string().uuid(),
  unit_id:          z.string().uuid(),
  chair_id:         z.string().uuid(),
  procedure_id:     z.string().uuid(),
  start_at:         z.string().datetime(),
  duration_minutes: z.number().int().positive(),
})

const listSchema = z.object({
  unit_id:    z.string().uuid().optional(),
  dentist_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_from:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:     z.string().optional(),
  q:          z.string().optional(),
  page:       z.coerce.number().int().positive().default(1),
  page_size:  z.coerce.number().int().min(1).max(500).default(50),
})

const APPOINTMENT_SELECT = `
  id, start_at, end_at, duration_minutes, status, notes, created_by_role, created_at,
  patient:patients(id, name, phone),
  dentist:dentists(id, color, user:users(name)),
  procedure:procedures(id, name, color, duration_minutes),
  chair:chairs(id, name),
  unit:units(id, name)
`

// GET /api/appointments — lista consultas da conta
export const GET = withAuth(async (req, ctx) => {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = listSchema.safeParse(params)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { unit_id, dentist_id, patient_id, date, date_from, date_to, status, q, page, page_size } = parsed.data
  const from = (page - 1) * page_size

  // Busca textual global accent-insensitive: o RPC search_appointment_ids casa
  // o termo por nome de paciente/procedimento/dentista (via unaccent, igual a
  // search_patients) e devolve os ids. A rota então re-seleciona com o shape
  // aninhado de sempre e mantém os filtros de status e de papel.
  const term = q?.trim()
  if (term && term.length >= 2) {
    const acct = ctx.user.accountId

    // search_appointment_ids ainda não está nos tipos gerados (migration 0004).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matched, error: matchErr } = await (supabaseAdmin as any).rpc('search_appointment_ids', {
      p_account_id: acct,
      p_term:       term,
    })
    if (matchErr) return err(matchErr.message, 500)

    const ids: string[] = (matched ?? []).map((r: { id: string }) => r.id)
    // Nada casou → resultado vazio, sem rodar a query principal.
    if (ids.length === 0) {
      return ok({ data: [], total: 0, page, page_size })
    }

    let searchQuery = supabaseAdmin
      .from('appointments')
      .select(APPOINTMENT_SELECT, { count: 'exact' })
      .eq('account_id', acct)
      .in('id', ids)
      .order('start_at', { ascending: true })
      .range(from, from + page_size - 1)

    if (status && status !== 'all') {
      searchQuery = searchQuery.eq('status', status as 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show')
    } else if (!status) {
      searchQuery = searchQuery.not('status', 'in', '("cancelled","no_show")')
    }

    if (ctx.user.role === 'dentist') {
      const { data: dentist } = await supabaseAdmin
        .from('dentists').select('id').eq('user_id', ctx.user.sub).single()
      if (dentist) searchQuery = searchQuery.eq('dentist_id', dentist.id)
    }

    const { data, error, count } = await searchQuery
    if (error) return err(error.message, 500)
    return ok({ data, total: count ?? 0, page, page_size })
  }

  let query = supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_SELECT, { count: 'exact' })
    .eq('account_id', ctx.user.accountId)
    .order('start_at', { ascending: true })
    .range(from, from + page_size - 1)

  if (unit_id)    query = query.eq('unit_id', unit_id)
  if (dentist_id) query = query.eq('dentist_id', dentist_id)
  if (patient_id) query = query.eq('patient_id', patient_id)
  if (status && status !== 'all') query = query.eq('status', status as 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show')
  else if (!status)               query = query.not('status', 'in', '("cancelled","no_show")')
  if (date) {
    query = query
      .gte('start_at', `${date}T00:00:00Z`)
      .lte('start_at', `${date}T23:59:59Z`)
  }
  if (date_from) query = query.gte('start_at', `${date_from}T00:00:00Z`)
  if (date_to)   query = query.lte('start_at', `${date_to}T23:59:59Z`)

  // Dentistas só veem a própria agenda
  if (ctx.user.role === 'dentist') {
    const { data: dentist } = await supabaseAdmin
      .from('dentists')
      .select('id')
      .eq('user_id', ctx.user.sub)
      .single()
    if (dentist) query = query.eq('dentist_id', dentist.id)
  }

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  return ok({ data, total: count ?? 0, page, page_size })
})

// POST /api/appointments — cria consulta
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { patient_id, dentist_id, unit_id, chair_id, procedure_id, start_at, duration_minutes } = parsed.data

  const startDate = new Date(start_at)
  const endDate = new Date(startDate.getTime() + duration_minutes * 60_000)
  const end_at = endDate.toISOString()

  // Re-verifica conflito atomicamente antes de criar (proteção contra race condition)
  const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: dentist_id,
    p_chair_id:   chair_id,
    p_start_at:   start_at,
    p_end_at:     end_at,
    p_exclude_id: undefined,
  })

  if (conflicts && conflicts.length > 0) {
    return err('Scheduling conflict: ' + conflicts[0].conflict_type + ' is not available', 409)
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      account_id:       ctx.user.accountId,
      patient_id,
      dentist_id,
      unit_id,
      chair_id,
      procedure_id,
      start_at,
      end_at,
      duration_minutes,
      status:           'scheduled',
      created_by_role:  ctx.user.role === 'ai_agent' ? 'ai_agent' : 'receptionist',
    })
    .select()
    .single()

  if (error) return err(error.message, 500)

  return ok(data, 201)
}, ['admin', 'receptionist', 'ai_agent'])
