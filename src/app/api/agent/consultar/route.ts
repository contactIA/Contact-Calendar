import { withAgentAuth, findPatientByPhone } from '@/lib/agentAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { err, ok } from '@/lib/api'
import { spDate, spTime } from '@/lib/tz'
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

  const match = await findPatientByPhone(user.accountId, telefone)
  if (match.status === 'many') {
    return err('Mais de um paciente com esse telefone. Confirme os dados antes de prosseguir.', 409)
  }
  if (match.status === 'none') {
    return ok({ tem_agendamento: false, proxima_consulta: null, mensagem: 'Paciente não encontrado' })
  }

  const { data: upcoming, error: upcomingErr } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, start_at, end_at, status, duration_minutes,
      dentist:dentists(user:users(name)),
      procedure:procedures(name),
      unit:units(name)
    `)
    .eq('account_id', user.accountId)
    .eq('patient_id', match.id)
    .in('status', ['scheduled', 'confirmed', 'in_progress'])
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(1)

  if (upcomingErr) return err(upcomingErr.message, 500)

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
      data:          spDate(appt.start_at),
      horario:       spTime(appt.start_at),
      dentista:      dentistName,
      procedimento,
      unidade,
      status:        appt.status,
      resumo:        `${procedimento} com ${dentistName} em ${dataFormatada} às ${horaFormatada}${unidade ? ` na ${unidade}` : ''}`,
    },
  })
})
