import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { rescheduleReminder } from '@/lib/helena'
import { z } from 'zod'

const rescheduleSchema = z.object({
  start_at:         z.string().datetime(),
  duration_minutes: z.number().int().positive(),
  dentist_id:       z.string().uuid().optional(),
  chair_id:         z.string().uuid().optional(),
})

// PATCH /api/appointments/:id — remarcar (nova data/hora)
export const PATCH = withAuth(async (req, ctx, params) => {
  const id = params?.id
  if (!id) return err('Missing appointment id', 400)

  const body = await req.json().catch(() => null)
  const parsed = rescheduleSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { start_at, duration_minutes, dentist_id, chair_id } = parsed.data
  const end_at = new Date(new Date(start_at).getTime() + duration_minutes * 60_000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabaseAdmin as any)
    .from('appointments')
    .select('id, status, dentist_id, chair_id, reminder_message_id')
    .eq('id', id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (!existing) return err('Appointment not found', 404)
  if (['completed', 'cancelled', 'no_show'].includes(existing.status)) {
    return err('Cannot reschedule a finalized appointment', 409)
  }

  const resolvedDentistId = dentist_id ?? existing.dentist_id
  const resolvedChairId   = chair_id   ?? existing.chair_id

  // Check conflict (excluding this appointment itself)
  const { data: conflicts } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: resolvedDentistId,
    p_chair_id:   resolvedChairId,
    p_start_at:   start_at,
    p_end_at:     end_at,
    p_exclude_id: id,
  })

  if (conflicts && conflicts.length > 0) {
    return err('Conflito de horário: ' + conflicts[0].conflict_type + ' indisponível', 409)
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({
      start_at,
      end_at,
      duration_minutes,
      dentist_id: resolvedDentistId,
      chair_id:   resolvedChairId,
      status:     'scheduled',
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  // Best-effort: move o lembrete da Helena para o novo horário.
  const { data: info } = await supabaseAdmin
    .from('appointments')
    .select('start_at, patient:patients(name, phone), dentist:dentists(user:users(name)), procedure:procedures(name)')
    .eq('id', id)
    .single()

  if (info) {
    const patient = info.patient as { name: string | null; phone: string | null } | null
    const newReminderId = await rescheduleReminder(ctx.user.accountId, existing.reminder_message_id, {
      phone:         patient?.phone,
      startAtISO:    info.start_at,
      patientName:   patient?.name,
      dentistName:   (info.dentist as { user: { name: string } | null } | null)?.user?.name,
      procedureName: (info.procedure as { name: string } | null)?.name,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('appointments').update({ reminder_message_id: newReminderId }).eq('id', id)
  }

  return ok(data)
}, ['admin', 'receptionist'])
