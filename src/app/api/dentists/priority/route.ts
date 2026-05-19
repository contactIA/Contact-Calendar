import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const querySchema = z.object({
  unit_id:      z.string().uuid(),
  procedure_id: z.string().uuid().optional(),
  patient_id:   z.string().uuid().optional(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// GET /api/dentists/priority
export const GET = withAuth(async (req, ctx) => {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { unit_id, procedure_id, patient_id, date } = parsed.data

  // Busca dentistas vinculados à unidade com suas prioridades
  let query = supabaseAdmin
    .from('dentist_units')
    .select(`
      priority,
      dentist:dentists(
        id, color, specialty,
        user:users(name)
      )
    `)
    .eq('unit_id', unit_id)
    .eq('account_id', ctx.user.accountId)
    .order('priority', { ascending: true })

  const { data: dentistUnits, error } = await query
  if (error) return err(error.message, 500)

  // Filtra por especialidade requerida pelo procedimento
  let filteredDentists = dentistUnits ?? []
  if (procedure_id) {
    const { data: proc } = await supabaseAdmin
      .from('procedures')
      .select('required_specialty')
      .eq('id', procedure_id)
      .single()

    if (proc?.required_specialty) {
      filteredDentists = filteredDentists.filter(du => {
        const d = du.dentist as { specialty: string[] } | null
        return d?.specialty?.includes(proc.required_specialty!)
      })
    }
  }

  // Contagem de consultas do dia (critério de ocupação)
  let occupationMap: Record<string, number> = {}
  if (date) {
    const { data: appts } = await supabaseAdmin
      .from('appointments')
      .select('dentist_id')
      .eq('account_id', ctx.user.accountId)
      .eq('unit_id', unit_id)
      .gte('start_at', `${date}T00:00:00Z`)
      .lte('start_at', `${date}T23:59:59Z`)
      .not('status', 'in', '("cancelled","no_show")')

    for (const a of appts ?? []) {
      occupationMap[a.dentist_id] = (occupationMap[a.dentist_id] ?? 0) + 1
    }
  }

  // Histórico: dentista que já atendeu esse paciente
  let patientDentistIds = new Set<string>()
  if (patient_id) {
    const { data: history } = await supabaseAdmin
      .from('appointments')
      .select('dentist_id')
      .eq('account_id', ctx.user.accountId)
      .eq('patient_id', patient_id)
      .not('status', 'in', '("cancelled")')

    for (const a of history ?? []) patientDentistIds.add(a.dentist_id)
  }

  const result = filteredDentists.map(du => {
    const d = du.dentist as { id: string; color: string; specialty: string[]; user: { name: string } | null }
    const reasons: string[] = []

    if (patientDentistIds.has(d.id)) reasons.push('patient_history')
    if (date && occupationMap[d.id] !== undefined) reasons.push('occupation_score')

    return {
      id:              d.id,
      name:            d.user?.name ?? 'Dentista',
      color:           d.color,
      specialty:       d.specialty,
      priority_score:  du.priority,
      occupation_today: occupationMap[d.id] ?? 0,
      priority_reasons: reasons,
    }
  }).sort((a, b) => {
    // Prioriza histórico com paciente, depois menor ocupação, depois prioridade numérica
    const aHist = a.priority_reasons.includes('patient_history') ? -1 : 0
    const bHist = b.priority_reasons.includes('patient_history') ? -1 : 0
    if (aHist !== bHist) return aHist - bHist
    if (a.occupation_today !== b.occupation_today) return a.occupation_today - b.occupation_today
    return a.priority_score - b.priority_score
  })

  return ok(result)
})
