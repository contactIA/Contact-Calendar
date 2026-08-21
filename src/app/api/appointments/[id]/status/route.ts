import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { tagContactByStatus, cancelReminder } from '@/lib/helena'
import { enqueueCardMove, type CardMoveEventKind } from '@/lib/sync/cardSyncEngine'
import { z } from 'zod'

const bodySchema = z.object({
  // Status reais da consulta (enum do banco). NÃO inclui fechamento: fechar é
  // desfecho comercial, não estado clínico — vem no campo `close` abaixo.
  status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  reason: z.string().optional(),
  // TASK-035: desfecho comercial de uma consulta já 'completed'. Quando `close`
  // vem, o status NÃO muda (fica completed); grava-se closed_outcome/closed_value
  // e dispara o card move. 'won' exige closed_value > 0.
  close: z.enum(['won', 'lost']).optional(),
  closed_value: z.number().positive().optional(),
}).refine(d => d.status || d.close, { message: 'Informe status ou close' })

const STATUS_TO_CARD_MOVE_KIND: Record<string, CardMoveEventKind> = {
  cancelled: 'cancelled',
  no_show:   'no_show',
  completed: 'completed',
}
const CLOSE_TO_CARD_MOVE_KIND: Record<string, CardMoveEventKind> = {
  won:  'closed_won',
  lost: 'closed_lost',
}

// PATCH /api/appointments/[id]/status
export const PATCH = withAuth(async (req, ctx, params) => {
  const id = params?.id
  if (!id) return err('Missing appointment id', 400)

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { status, reason, close, closed_value } = parsed.data

  // TASK-035: fechar orçamento (won) exige valor > 0.
  if (close === 'won' && !(closed_value && closed_value > 0)) {
    return err('Informe o valor do fechamento', 400)
  }

  // Papéis: IA só cancela. Dentista não cancela nem marca no_show, MAS PODE
  // registrar o fechamento: o dentista avaliador é quem está na cadeira
  // apresentando o orçamento — ele sabe na hora se o paciente fechou.
  if (ctx.user.role === 'ai_agent' && status !== 'cancelled') {
    return err('AI agent can only set status to cancelled', 403)
  }
  if (ctx.user.role === 'dentist' && status && ['cancelled', 'no_show'].includes(status)) {
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

  // Monta o update conforme a operação: registrar fechamento (close) mantém o
  // status 'completed'; mudança de status segue o fluxo normal.
  let updatePayload: Record<string, unknown>
  if (close) {
    // O desfecho comercial deriva de uma consulta ATENDIDA.
    if (existing.status !== 'completed') {
      return err('Só é possível registrar o fechamento de uma consulta concluída', 409)
    }
    updatePayload = {
      closed_outcome: close,
      closed_value:   close === 'won' ? closed_value : null,
    }
  } else {
    if (['completed', 'cancelled', 'no_show'].includes(existing.status)) {
      return err('Cannot change status of a finalized appointment', 409)
    }
    updatePayload = {
      status,
      ...(status === 'cancelled' && {
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason ?? undefined,
      }),
    }
  }

  const { data, error } = await (supabaseAdmin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('appointments')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  const patient = existing.patient as { name: string | null; phone: string | null; helena_contact_id: string | null } | null

  // Best-effort: etiqueta o contato conforme o novo status (não bloqueia).
  // Só em mudança de status — fechamento não muda o status clínico.
  if (status) {
    await tagContactByStatus(ctx.user.accountId, patient?.phone, status)
    if (status === 'cancelled') {
      await cancelReminder(ctx.user.accountId, existing.reminder_message_id)
    }
  }

  // fire-and-enqueue: move o card no funil (TASK-022) sem travar a resposta.
  const cardMoveKind = close ? CLOSE_TO_CARD_MOVE_KIND[close] : (status ? STATUS_TO_CARD_MOVE_KIND[status] : undefined)
  if (cardMoveKind) {
    void enqueueCardMove(ctx.user.accountId, {
      kind:          cardMoveKind,
      appointmentId: existing.id,
      patientId:     existing.patient_id,
      contactId:     patient?.helena_contact_id ?? null,
      leadName:      patient?.name ?? null,
      unitId:        existing.unit_id,
      apptLabel:     new Date(existing.start_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      // Só a engine usa em closed_won; nos demais kinds é ignorado.
      closedValue:   close === 'won' ? closed_value ?? null : null,
    }).catch(e => console.error('[card-sync] enqueueCardMove falhou (status)', e))
  }

  return ok(data)
})
