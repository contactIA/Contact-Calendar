import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const querySchema = z.object({
  dentist_id:        z.string().regex(UUID_RE, 'Invalid UUID'),
  unit_id:           z.string().regex(UUID_RE, 'Invalid UUID'),
  procedure_id:      z.string().regex(UUID_RE, 'Invalid UUID'),
  date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_override: z.coerce.number().int().positive().optional(),
})

// GET /api/slots/available
export const GET = withAuth(async (req) => {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)

  if (!parsed.success) {
    return err(parsed.error.issues[0].message, 400)
  }

  const { dentist_id, unit_id, procedure_id, date, duration_override } = parsed.data

  const { data, error } = await supabaseAdmin.rpc('get_available_slots', {
    p_dentist_id:        dentist_id,
    p_unit_id:           unit_id,
    p_procedure_id:      procedure_id,
    p_date:              date,
    p_duration_override: duration_override ?? undefined,
  })

  if (error) return err(error.message, 500)

  return ok(data ?? [])
})
