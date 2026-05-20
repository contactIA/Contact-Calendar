import { NextRequest } from 'next/server'
import { withAgentAuth, normalizePhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
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
  const cleanPhone = normalizePhone(telefone)
  const { data: patients } = await supabaseAdmin
    .from('patients')
    .select('id')
    .eq('account_id', user.accountId)
    .ilike('phone', `%${cleanPhone.slice(-10)}%`)
    .limit(1)

  if (!patients?.length) return err('Paciente não encontrado para este telefone', 404)
  const patientId = patients[0].id

  // Busca o agendamento a remarcar
  let query = supabaseAdmin
    .from('appointments')
    .select('id, start_at, end_at, duration_minutes, dentist_id, chair_id, unit_id, status')
    .eq('account_id', user.accountId)
    .eq('patient_id', patientId)
    .in('status', ['scheduled', 'confirmed'])

  if (agendamento_id) {
    query = query.eq('id', agendamento_id)
  } else {
    query = query.gte('start_at', new Date().toISOString()).order('start_at', { ascending: true }).limit(1)
  }

  const { data: appts, error: fetchErr } = await query
  if (fetchErr || !appts?.length) return err('Agendamento não encontrado', 404)
  const appt = appts[0]

  const dentistId = novo_dentista_id ?? appt.dentist_id
  const newStart  = new Date(novo_horario)
  const newEnd    = new Date(newStart.getTime() + appt.duration_minutes * 60_000)
  const end_at    = newEnd.toISOString()

  // Resolve cadeira
  let resolvedChairId = chair_id ?? appt.chair_id
  if (chair_id === undefined && novo_dentista_id) {
    // Se mudou o dentista, revalida cadeira ou busca uma disponível
    const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
      p_dentist_id: dentistId,
      p_chair_id:   appt.chair_id,
      p_start_at:   novo_horario,
      p_end_at:     end_at,
      p_exclude_id: appt.id,
    })
    if (conflicts?.length) {
      // Tenta encontrar outra cadeira
      const { data: chairs } = await supabaseAdmin
        .from('chairs')
        .select('id')
        .eq('account_id', user.accountId)
        .eq('unit_id', appt.unit_id)
        .eq('is_active', true)
        .order('name', { ascending: true })

      resolvedChairId = undefined as unknown as string
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
  }

  // Verificação final de conflito
  const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: dentistId,
    p_chair_id:   resolvedChairId,
    p_start_at:   novo_horario,
    p_end_at:     end_at,
    p_exclude_id: appt.id,
  })
  if (conflicts?.length) return err(`Conflito: ${conflicts[0].conflict_type} não disponível`, 409)

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
      dentist:dentists(user:users(name)),
      procedure:procedures(name)
    `)
    .single()

  if (error) return err(error.message, 500)

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
