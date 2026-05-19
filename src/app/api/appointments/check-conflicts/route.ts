import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const bodySchema = z.object({
  dentist_id: z.string().uuid(),
  chair_id:   z.string().uuid(),
  unit_id:    z.string().uuid(),
  start_at:   z.string().datetime(),
  end_at:     z.string().datetime(),
  exclude_id: z.string().uuid().optional(),
})

// POST /api/appointments/check-conflicts
export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    return err(parsed.error.issues[0].message, 400)
  }

  const { dentist_id, chair_id, start_at, end_at, exclude_id } = parsed.data

  const { data, error } = await supabaseAdmin.rpc('check_appointment_conflict', {
    p_dentist_id: dentist_id,
    p_chair_id:   chair_id,
    p_start_at:   start_at,
    p_end_at:     end_at,
    p_exclude_id: exclude_id ?? undefined,
  })

  if (error) return err(error.message, 500)

  const conflicts = data ?? []
  return ok({
    has_conflict: conflicts.length > 0,
    conflicts: conflicts.map((c: { conflict_type: string; conflict_id: string }) => ({
      type:           c.conflict_type,
      appointment_id: c.conflict_id,
    })),
  })
})
