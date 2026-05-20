import { NextRequest } from 'next/server'
import { withAgentAuth, normalizePhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  data:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit_id:              z.string().uuid(),
  procedure_id:         z.string().uuid().optional(),
  telefone:             z.string().optional(),
  quantidade_dentistas: z.coerce.number().int().min(1).max(5).default(2),
})

// POST /api/agent/disponibilidade
export const POST = withAgentAuth(async (req, { user }) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data: date, unit_id, procedure_id, telefone, quantidade_dentistas } = parsed.data

  // Resolve patient_id pelo telefone (para prioridade por histórico)
  let patient_id: string | undefined
  if (telefone) {
    const cleaned = normalizePhone(telefone)
    const { data: patients } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('account_id', user.accountId)
      .ilike('phone', `%${cleaned.slice(-10)}%`)
      .limit(1)
    patient_id = patients?.[0]?.id
  }

  // Obtém dentistas ordenados por prioridade
  let dentistQuery = supabaseAdmin
    .from('dentist_units')
    .select(`priority, dentist:dentists(id, color, specialty, user:users(name))`)
    .eq('unit_id', unit_id)
    .eq('account_id', user.accountId)
    .order('priority', { ascending: true })

  const { data: dentistUnits, error: dentistErr } = await dentistQuery
  if (dentistErr) return err(dentistErr.message, 500)

  let filtered = dentistUnits ?? []

  // Filtra por especialidade se procedimento exige
  if (procedure_id) {
    const { data: proc } = await supabaseAdmin
      .from('procedures')
      .select('required_specialty')
      .eq('id', procedure_id)
      .single()
    if (proc?.required_specialty) {
      filtered = filtered.filter(du => {
        const d = du.dentist as { specialty: string[] } | null
        return d?.specialty?.includes(proc.required_specialty!)
      })
    }
  }

  // Ocupação do dia
  const { data: appts } = await supabaseAdmin
    .from('appointments')
    .select('dentist_id')
    .eq('account_id', user.accountId)
    .eq('unit_id', unit_id)
    .gte('start_at', `${date}T00:00:00Z`)
    .lte('start_at', `${date}T23:59:59Z`)
    .not('status', 'in', '("cancelled","no_show")')

  const occupationMap: Record<string, number> = {}
  for (const a of appts ?? []) {
    occupationMap[a.dentist_id] = (occupationMap[a.dentist_id] ?? 0) + 1
  }

  // Histórico do paciente
  const patientDentistIds = new Set<string>()
  if (patient_id) {
    const { data: history } = await supabaseAdmin
      .from('appointments')
      .select('dentist_id')
      .eq('account_id', user.accountId)
      .eq('patient_id', patient_id)
      .not('status', 'in', '("cancelled")')
    for (const a of history ?? []) patientDentistIds.add(a.dentist_id)
  }

  // Ordena: histórico paciente → menor ocupação → prioridade numérica
  const sorted = filtered
    .map(du => {
      const d = du.dentist as { id: string; color: string; specialty: string[]; user: { name: string } | null }
      return {
        id:             d.id,
        nome:           d.user?.name ?? 'Dentista',
        priority_score: du.priority,
        occupation:     occupationMap[d.id] ?? 0,
        has_history:    patientDentistIds.has(d.id),
      }
    })
    .sort((a, b) => {
      if (a.has_history !== b.has_history) return a.has_history ? -1 : 1
      if (a.occupation !== b.occupation) return a.occupation - b.occupation
      return a.priority_score - b.priority_score
    })

  if (sorted.length === 0) {
    return ok({ data: date, recomendado: null, alternativas: [], mensagem: 'Nenhum dentista disponível para os critérios informados.' })
  }

  // Busca slots dos top N dentistas em paralelo
  const top = sorted.slice(0, quantidade_dentistas)

  const slotsResults = await Promise.all(
    top.map(d =>
      supabaseAdmin
        .rpc('get_available_slots', {
          p_dentist_id:        d.id,
          p_unit_id:           unit_id,
          p_procedure_id:      procedure_id ?? null,
          p_date:              date,
          p_duration_override: null,
        })
        .then(res => ({ dentista_id: d.id, nome: d.nome, has_history: d.has_history, slots: res.data ?? [] }))
    )
  )

  // Formata horários como HH:MM
  const format = (slots: { start_time: string }[]) =>
    slots.map(s => s.start_time?.slice(0, 5)).filter(Boolean)

  const [first, ...rest] = slotsResults

  const recomendado = first
    ? {
        dentista_id: first.dentista_id,
        dentista:    first.nome,
        horarios:    format(first.slots as { start_time: string }[]),
        motivo:      first.has_history ? 'Histórico com o paciente' : 'Maior disponibilidade e prioridade',
      }
    : null

  const alternativas = rest.map(r => ({
    dentista_id: r.dentista_id,
    dentista:    r.nome,
    horarios:    format(r.slots as { start_time: string }[]),
  }))

  return ok({ data: date, recomendado, alternativas, paciente_id: patient_id ?? null })
})
