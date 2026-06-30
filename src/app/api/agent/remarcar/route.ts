import { withAgentAuth, findPatientByPhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { rescheduleReminder } from '@/lib/helena'
import { z } from 'zod'

const schema = z.object({
  telefone:          z.string(),
  agendamento_id:    z.string().uuid().optional(),
  novo_horario:      z.string().datetime(),
  novo_dentista_id:  z.string().uuid().optional(),
  chair_id:          z.string().uuid().optional(),
})

// POST /api/agent/remarcar
export const POST = withAgentAuth(async (req, { user }) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { telefone, agendamento_id, novo_horario, novo_dentista_id, chair_id } = parsed.data

  // Localiza paciente pelo telefone
  const match = await findPatientByPhone(user.accountId, telefone)
  if (match.status === 'many') return err('Mais de um paciente com esse telefone. Confirme os dados antes de remarcar.', 409)
  if (match.status === 'none') return err('Paciente não encontrado para este telefone', 404)
  const patientId = match.id

  // Busca o agendamento a remarcar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabaseAdmin as any)
    .from('appointments')
    .select('id, start_at, end_at, duration_minutes, dentist_id, chair_id, unit_id, status, reminder_message_id')
    .eq('account_id', user.accountId)
    .eq('patient_id', patientId)
    .in('status', ['scheduled', 'confirmed'])

  if (agendamento_id) {
    query = query.eq('id', agendamento_id)
  } else {
    query = query.gte('start_at', new Date().toISOString()).order('start_at', { ascending: true }).limit(1)
  }

  const { data: appts, error: fetchErr } = await query
  if (fetchErr) return err(fetchErr.message, 500)
  if (!appts?.length) return err('Agendamento não encontrado', 404)
  const appt = appts[0]

  const dentistId = novo_dentista_id ?? appt.dentist_id
  const newStart  = new Date(novo_horario)
  const newEnd    = new Date(newStart.getTime() + appt.duration_minutes * 60_000)
  const end_at    = newEnd.toISOString()

  // Resolve cadeira: usa a informada (ou a atual) se estiver livre no novo
  // horário; caso contrário procura qualquer cadeira ativa disponível na
  // unidade. Vale para qualquer remarcação — mudando ou não o dentista.
  const preferredChairId = chair_id ?? appt.chair_id
  let resolvedChairId: string | undefined = preferredChairId

  const { data: preferredConflict, error: confErr } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: dentistId,
    p_chair_id:   preferredChairId,
    p_start_at:   novo_horario,
    p_end_at:     end_at,
    p_exclude_id: appt.id,
  })
  if (confErr) return err(confErr.message, 500)

  if (preferredConflict?.length) {
    // A cadeira preferida (ou o dentista) conflita. Se o conflito é só de
    // cadeira, tenta outra; se for do dentista, não há o que fazer.
    const dentistBusy = preferredConflict.some(c => c.conflict_type === 'dentist' || c.conflict_type === 'block')
    if (dentistBusy) {
      return err(`Conflito: ${preferredConflict[0].conflict_type} não disponível no novo horário`, 409)
    }

    resolvedChairId = undefined
    const { data: chairs } = await supabaseAdmin
      .from('chairs')
      .select('id')
      .eq('account_id', user.accountId)
      .eq('unit_id', appt.unit_id)
      .eq('is_active', true)
      .order('name', { ascending: true })

    for (const ch of chairs ?? []) {
      const { data: c2 } = await supabaseAdmin.rpc('check_appointment_conflict', {
        p_dentist_id: dentistId,
        p_chair_id:   ch.id,
        p_start_at:   novo_horario,
        p_end_at:     end_at,
        p_exclude_id: appt.id,
      })
      if (!c2?.length) { resolvedChairId = ch.id; break }
    }
    if (!resolvedChairId) return err('Nenhuma cadeira disponível no novo horário', 409)
  }

  const { data: updated, error } = await supabaseAdmin
    .from('appointments')
    .update({
      start_at:    novo_horario,
      end_at,
      dentist_id:  dentistId,
      chair_id:    resolvedChairId,
      status:      'scheduled',
    })
    .eq('id', appt.id)
    .select(`
      id, start_at,
      patient:patients(name, phone),
      dentist:dentists(user:users(name)),
      procedure:procedures(name)
    `)
    .single()

  if (error) {
    // 23P01 = exclusion_violation: corrida barrada pela trava do banco.
    if (error.code === '23P01') return err('Conflito: horário acabou de ser ocupado', 409)
    return err(error.message, 500)
  }

  // Best-effort: move o lembrete da Helena para o novo horário.
  const patientInfo = updated.patient as { name: string | null; phone: string | null } | null
  const newReminderId = await rescheduleReminder(user.accountId, appt.reminder_message_id, {
    phone:         patientInfo?.phone,
    startAtISO:    updated.start_at,
    patientName:   patientInfo?.name,
    dentistName:   (updated.dentist as { user: { name: string } | null } | null)?.user?.name,
    procedureName: (updated.procedure as { name: string } | null)?.name,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).from('appointments').update({ reminder_message_id: newReminderId }).eq('id', appt.id)

  const dentistName  = (updated.dentist as { user: { name: string } | null } | null)?.user?.name ?? 'Dentista'
  const procedimento = (updated.procedure as { name: string } | null)?.name ?? ''
  const dataFormatada = new Date(updated.start_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const horaFormatada = new Date(updated.start_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

  return ok({
    reagendado:     true,
    agendamento_id: updated.id,
    resumo:         `${procedimento} com ${dentistName} remarcada para ${dataFormatada} às ${horaFormatada}`,
  })
})
