import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { tagContactByStatus, cancelReminder } from '@/lib/helena'
import { enqueueCardMove, type CardMoveEventKind } from '@/lib/sync/cardSyncEngine'
import { z } from 'zod'

const bodySchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  reason: z.string().optional(),
})

// Nem todo status de agendamento tem um evento correspondente na engine
// (confirmed/in_progress ficam sem card move — só os 3 abaixo movem o funil).
const STATUS_TO_CARD_MOVE_KIND: Partial<Record<typeof bodySchema['_output']['status'], CardMoveEventKind>> = {
  cancelled: 'cancelled',
  no_show:   'no_show',
  completed: 'completed',
}

// PATCH /api/appointments/[id]/status
export const PATCH = withAuth(async (req, ctx, params) => {
  const id = params?.id
  if (!id) return err('Missing appointment id', 400)

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { status, reason } = parsed.data

  // IA só pode cancelar
  if (ctx.user.role === 'ai_agent' && status !== 'cancelled') {
    return err('AI agent can only set status to cancelled', 403)
  }

  // Dentista não pode cancelar nem marcar no_show
  if (ctx.user.role === 'dentist' && ['cancelled', 'no_show'].includes(status)) {
    return err('Dentists cannot cancel appointments or mark no_show', 403)
  }

  // Garante que o appointment pertence à conta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabaseAdmin as any)
    .from('appointments')
    .select('id, status, reminder_message_id, patient_id, unit_id, start_at, patient:patients(name, phone, helena_contact_id)')
    .eq('id', id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (!existing) return err('Appointment not found', 404)
  if (['completed', 'cancelled', 'no_show'].includes(existing.status)) {
    return err('Cannot change status of a finalized appointment', 409)
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({
      status,
      ...(status === 'cancelled' && {
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason ?? undefined,
      }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  // Best-effort: etiqueta o contato conforme o novo status (não bloqueia).
  const patient = existing.patient as { name: string | null; phone: string | null; helena_contact_id: string | null } | null
  await tagContactByStatus(ctx.user.accountId, patient?.phone, status)

  // Consulta cancelada não deve disparar lembrete — cancela o agendado na Helena.
  if (status === 'cancelled') {
    await cancelReminder(ctx.user.accountId, existing.reminder_message_id)
  }

  // fire-and-enqueue: move o card no funil (TASK-022) sem travar a resposta.
  const cardMoveKind = STATUS_TO_CARD_MOVE_KIND[status]
  if (cardMoveKind) {
    void enqueueCardMove(ctx.user.accountId, {
      kind:          cardMoveKind,
      appointmentId: existing.id,
      patientId:     existing.patient_id,
      contactId:     patient?.helena_contact_id ?? null,
      leadName:      patient?.name ?? null,
      unitId:        existing.unit_id,
      apptLabel:     new Date(existing.start_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    }).catch(e => console.error('[card-sync] enqueueCardMove falhou (status)', e))
  }

  return ok(data)
})
