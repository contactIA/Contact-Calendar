import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
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

  const { data: existing } = await supabaseAdmin
    .from('appointments')
    .select('id, status, dentist_id, chair_id')
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
  return ok(data)
}, ['admin', 'receptionist'])
