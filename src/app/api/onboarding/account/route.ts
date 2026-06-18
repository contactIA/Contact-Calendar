import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { signJwt } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  id:                z.string().uuid().optional(),
  name:              z.string().min(1).max(100),
  slug:              z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  admin_name:        z.string().min(1).max(100),
  admin_external_id: z.string().min(1).max(200),
  timezone:          z.string().default('America/Sao_Paulo'),
})

// POST /api/onboarding/account — cria account + admin user e retorna JWT + URL pronta
// id é opcional: se informado (vindo da Helena), usa esse UUID; caso contrário gera um novo.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { id, name, slug, admin_name, admin_external_id, timezone } = parsed.data

  // Se um id foi fornecido, verifica se já existe
  if (id) {
    const { data: existingAccount } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('id', id)
      .single()

    if (existingAccount) return err('Conta com esse ID já existe.', 409)
  }

  // Verifica slug único
  const { data: existingSlug } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingSlug) return err('Slug já está em uso. Escolha outro identificador.', 409)

  // Cria account (usa o id da Helena se fornecido, senão gera um novo)
  const { data: account, error: accErr } = await supabaseAdmin
    .from('accounts')
    .insert({ ...(id && { id }), name, slug, timezone })
    .select('id')
    .single()

  if (accErr) return err(accErr.message, 500)

  // Cria usuário admin
  const { data: adminUser, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      account_id:  account.id,
      name:        admin_name,
      external_id: admin_external_id,
      role:        'admin',
    })
    .select('id')
    .single()

  if (userErr) {
    await supabaseAdmin.from('accounts').delete().eq('id', account.id)
    return err(userErr.message, 500)
  }

  const token = await signJwt(
    { sub: adminUser.id, accountId: account.id, role: 'admin' },
    '8h'
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://contact-calendar-murex.vercel.app'
  const url = `${baseUrl}/${account.id}/agenda?userId=${encodeURIComponent(admin_external_id)}`

  return ok({ account_id: account.id, token, url }, 201)
}
