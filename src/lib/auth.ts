import { SignJWT, jwtVerify } from 'jose'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export type JwtPayload = {
  sub: string       // userId (ou 'ai_agent')
  accountId: string
  role: 'admin' | 'receptionist' | 'dentist' | 'ai_agent'
  iat?: number
  exp?: number
}

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresIn: string) {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as JwtPayload
}

// Autentica usuário humano via URL params (accountId + externalUserId)
export async function authenticateHumanUser(accountId: string, externalUserId: string) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, role, unit_id')
    .eq('account_id', accountId)
    .eq('external_id', externalUserId)
    .single()

  if (error || !user) return null

  const token = await signJwt(
    { sub: user.id, accountId, role: user.role },
    '8h'
  )

  return { token, expiresIn: 28800, user }
}

// Autentica agente de IA via API Key
export async function authenticateAiAgent(apiKey: string, accountId: string) {
  const { data: keys } = await supabaseAdmin
    .from('ai_api_keys')
    .select('id, key_hash')
    .eq('account_id', accountId)
    .eq('is_active', true)

  if (!keys?.length) return null

  const results = await Promise.all(keys.map(k => bcrypt.compare(apiKey, k.key_hash).then(ok => ({ ok, k }))))
  const matched = results.find(r => r.ok)?.k
  if (!matched) return null

  // Atualiza last_used_at
  await supabaseAdmin
    .from('ai_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', matched.id)

  const token = await signJwt(
    { sub: 'ai_agent', accountId, role: 'ai_agent' },
    '60m'
  )

  return { token, expiresIn: 3600 }
}
