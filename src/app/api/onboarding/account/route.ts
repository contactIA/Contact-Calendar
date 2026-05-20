import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { signJwt } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  name:              z.string().min(1).max(100),
  slug:              z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  admin_name:        z.string().min(1).max(100),
  admin_external_id: z.string().min(1).max(200),
  timezone:          z.string().default('America/Sao_Paulo'),
})

// POST /api/onboarding/account — cria account + admin user e retorna JWT
// Sem autenticação: este é o ponto de entrada para novos white labels.
// Em produção, proteger com um secret de plataforma ou IP allowlist.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { name, slug, admin_name, admin_external_id, timezone } = parsed.data

  // Verifica slug único
  const { data: existing } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) return err('Slug já está em uso. Escolha outro identificador.', 409)

  // Cria account
  const { data: account, error: accErr } = await supabaseAdmin
    .from('accounts')
    .insert({ name, slug, timezone })
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

  // Gera JWT para o admin continuar o onboarding autenticado
  const token = await signJwt(
    { sub: adminUser.id, accountId: account.id, role: 'admin' },
    '8h'
  )

  return ok({ account_id: account.id, token }, 201)
}
