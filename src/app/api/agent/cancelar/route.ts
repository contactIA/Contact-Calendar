import { NextRequest } from 'next/server'
import { withAgentAuth, normalizePhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  telefone:       z.string(),
  agendamento_id: z.string().uuid().optional(),
})

// POST /api/agent/cancelar
export const POST = withAgentAuth(async (req, { user }) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { telefone, agendamento_id } = parsed.data

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

  let appointmentId = agendamento_id

  // Se não informado, busca a próxima consulta agendada
  if (!appointmentId) {
    const { data: upcoming } = await supabaseAdmin
      .from('appointments')
      .select('id, start_at, dentist:dentists(user:users(name)), procedure:procedures(name)')
      .eq('account_id', user.accountId)
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(1)

    if (!upcoming?.length) return err('Nenhum agendamento futuro encontrado para este paciente', 404)
    appointmentId = upcoming[0].id
  }

  // Verifica que o agendamento pertence ao paciente e à conta
  const { data: appt, error: fetchErr } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, start_at, status,
      dentist:dentists(user:users(name)),
      procedure:procedures(name)
    `)
    .eq('id', appointmentId)
    .eq('account_id', user.accountId)
    .eq('patient_id', patientId)
    .single()

  if (fetchErr || !appt) return err('Agendamento não encontrado', 404)
  if (appt.status === 'cancelled') return err('Agendamento já está cancelado', 409)

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)

  if (error) return err(error.message, 500)

  const dentistName  = (appt.dentist as { user: { name: string } | null } | null)?.user?.name ?? 'Dentista'
  const procedimento = (appt.procedure as { name: string } | null)?.name ?? ''
  const dataFormatada = new Date(appt.start_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const horaFormatada = new Date(appt.start_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

  return ok({
    cancelado: true,
    resumo:    `${procedimento} com ${dentistName} em ${dataFormatada} às ${horaFormatada} foi cancelada`,
  })
})
