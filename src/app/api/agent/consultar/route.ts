import { NextRequest } from 'next/server'
import { withAgentAuth, normalizePhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  telefone: z.string(),
})

// POST /api/agent/consultar
export const POST = withAgentAuth(async (req, { user }) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { telefone } = parsed.data

  const cleanPhone = normalizePhone(telefone)
  const { data: patients } = await supabaseAdmin
    .from('patients')
    .select('id, name')
    .eq('account_id', user.accountId)
    .ilike('phone', `%${cleanPhone.slice(-10)}%`)
    .limit(1)

  if (!patients?.length) {
    return ok({ tem_agendamento: false, proxima_consulta: null, mensagem: 'Paciente não encontrado' })
  }

  const patient = patients[0]

  const { data: upcoming } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, start_at, end_at, status, duration_minutes,
      dentist:dentists(user:users(name)),
      procedure:procedures(name),
      unit:units(name)
    `)
    .eq('account_id', user.accountId)
    .eq('patient_id', patient.id)
    .in('status', ['scheduled', 'confirmed', 'in_progress'])
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(1)

  if (!upcoming?.length) {
    return ok({ tem_agendamento: false, proxima_consulta: null, mensagem: 'Nenhum agendamento futuro encontrado' })
  }

  const appt = upcoming[0]
  const dentistName  = (appt.dentist as { user: { name: string } | null } | null)?.user?.name ?? 'Dentista'
  const procedimento = (appt.procedure as { name: string } | null)?.name ?? ''
  const unidade      = (appt.unit as { name: string } | null)?.name ?? ''
  const dataFormatada = new Date(appt.start_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const horaFormatada = new Date(appt.start_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

  return ok({
    tem_agendamento: true,
    proxima_consulta: {
      id:            appt.id,
      data:          appt.start_at.slice(0, 10),
      horario:       appt.start_at.slice(11, 16),
      dentista:      dentistName,
      procedimento,
      unidade,
      status:        appt.status,
      resumo:        `${procedimento} com ${dentistName} em ${dataFormatada} às ${horaFormatada}${unidade ? ` na ${unidade}` : ''}`,
    },
  })
})
