import { withAgentAuth, normalizePhone, findPatientByPhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  telefone:         z.string(),
  nome_paciente:    z.string().optional(),
  dentista_id:      z.string().uuid(),
  horario:          z.string().datetime(),
  duracao_minutos:  z.number().int().positive().optional(),
  procedure_id:     z.string().uuid(),
  unit_id:          z.string().uuid(),
  chair_id:         z.string().uuid().optional(),
})

// POST /api/agent/agendar
export const POST = withAgentAuth(async (req, { user }) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { telefone, nome_paciente, dentista_id, horario, duracao_minutos, procedure_id, unit_id, chair_id } = parsed.data

  // Resolve ou cria paciente pelo telefone
  const cleanPhone = normalizePhone(telefone)
  let patientId: string

  const match = await findPatientByPhone(user.accountId, telefone)
  if (match.status === 'many') {
    return err('Mais de um paciente com esse telefone. Confirme os dados antes de agendar.', 409)
  }

  if (match.status === 'one') {
    patientId = match.id
  } else {
    const { data: created, error: createErr } = await supabaseAdmin
      .from('patients')
      .insert({
        account_id: user.accountId,
        name:       nome_paciente ?? 'Paciente via WhatsApp',
        phone:      cleanPhone,
      })
      .select('id, name')
      .single()
    if (createErr) return err('Erro ao criar paciente: ' + createErr.message, 500)
    patientId = created.id
  }

  // Resolve duração pelo procedimento se não informada
  let duration = duracao_minutos
  if (!duration) {
    const { data: proc } = await supabaseAdmin
      .from('procedures')
      .select('duration_minutes')
      .eq('id', procedure_id)
      .single()
    duration = proc?.duration_minutes ?? 60
  }

  const startDate = new Date(horario)
  const endDate   = new Date(startDate.getTime() + duration * 60_000)
  const end_at    = endDate.toISOString()

  // Resolve cadeira se não informada (primeira disponível na unidade sem conflito)
  let resolvedChairId = chair_id
  if (!resolvedChairId) {
    const { data: chairs } = await supabaseAdmin
      .from('chairs')
      .select('id')
      .eq('account_id', user.accountId)
      .eq('unit_id', unit_id)
      .eq('is_active', true)
      .order('name', { ascending: true })

    for (const chair of chairs ?? []) {
      const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
        p_dentist_id: dentista_id,
        p_chair_id:   chair.id,
        p_start_at:   horario,
        p_end_at:     end_at,
        p_exclude_id: undefined,
      })
      if (!conflicts?.length) {
        resolvedChairId = chair.id
        break
      }
    }

    if (!resolvedChairId) return err('Nenhuma cadeira disponível no horário solicitado', 409)
  }

  // Verificação de conflito final
  const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: dentista_id,
    p_chair_id:   resolvedChairId,
    p_start_at:   horario,
    p_end_at:     end_at,
    p_exclude_id: undefined,
  })

  if (conflicts?.length) {
    return err(`Conflito de agendamento: ${conflicts[0].conflict_type} não disponível`, 409)
  }

  const { data: appt, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      account_id:       user.accountId,
      patient_id:       patientId,
      dentist_id:       dentista_id,
      unit_id,
      chair_id:         resolvedChairId,
      procedure_id,
      start_at:         horario,
      end_at,
      duration_minutes: duration,
      status:           'scheduled',
      created_by_role:  'ai_agent',
    })
    .select(`
      id, start_at,
      patient:patients(name),
      dentist:dentists(user:users(name)),
      procedure:procedures(name)
    `)
    .single()

  if (error) {
    // 23P01 = exclusion_violation: a trava do banco barrou uma corrida que
    // passou pela checagem acima. Conflito de horário, não erro de servidor.
    if (error.code === '23P01') {
      return err('Conflito de agendamento: horário acabou de ser ocupado', 409)
    }
    return err(error.message, 500)
  }

  const dentistName  = (appt.dentist as { user: { name: string } | null } | null)?.user?.name ?? 'Dentista'
  const procedimento = (appt.procedure as { name: string } | null)?.name ?? ''
  const dataFormatada = new Date(appt.start_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const horaFormatada = new Date(appt.start_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

  return ok({
    confirmado:     true,
    agendamento_id: appt.id,
    resumo:         `${procedimento} com ${dentistName} em ${dataFormatada} às ${horaFormatada}`,
  }, 201)
})
