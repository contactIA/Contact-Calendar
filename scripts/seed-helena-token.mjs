/**
 * TASK-002 seed — migra o HELENA_API_TOKEN global para account_integrations.
 *
 * Pré-requisitos:
 *   1. Migration 0004_account_integrations.sql já aplicada no Supabase.
 *   2. INTEGRATIONS_ENCRYPTION_KEY gerada e em .env.local (64 chars hex).
 *
 * Como rodar (Node 20+):
 *   node --env-file=.env.local scripts/seed-helena-token.mjs
 *
 * Para gerar uma chave nova (PowerShell):
 *   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
 */

import { createCipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ── Validações de env ────────────────────────────────────────────────────────

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'HELENA_API_TOKEN',
  'INTEGRATIONS_ENCRYPTION_KEY',
]

for (const v of required) {
  if (!process.env[v]) {
    console.error(`❌ Variável de ambiente ausente: ${v}`)
    process.exit(1)
  }
}

const encKey = Buffer.from(process.env.INTEGRATIONS_ENCRYPTION_KEY, 'hex')
if (encKey.length !== 32) {
  console.error('❌ INTEGRATIONS_ENCRYPTION_KEY precisa ter 64 chars hex (32 bytes)')
  process.exit(1)
}

// ── Função de criptografia (espelha integrations.ts) ─────────────────────────

function encryptSecret(plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

// ── Cliente Supabase (service role) ──────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Busca a primeira conta disponível ────────────────────────────────────────

const { data: accounts, error: accErr } = await supabase
  .from('accounts')
  .select('id, name, slug')
  .limit(5)

if (accErr || !accounts?.length) {
  console.error('❌ Não foi possível buscar contas:', accErr?.message)
  process.exit(1)
}

console.log('\nContas disponíveis:')
accounts.forEach((a, i) => console.log(`  [${i}] ${a.slug} (${a.id})`))

// Se houver mais de uma conta, usar a primeira.
// Para especificar uma conta diferente, edite a linha abaixo.
const account = accounts[0]
console.log(`\n→ Usando conta: ${account.slug} (${account.id})`)

// ── Cifra e insere ───────────────────────────────────────────────────────────

const encryptedToken = encryptSecret(process.env.HELENA_API_TOKEN)

const { error: upsertErr } = await supabase
  .from('account_integrations')
  .upsert(
    {
      account_id: account.id,
      provider: 'helena',
      secrets: { token: encryptedToken },
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,provider' }
  )

if (upsertErr) {
  console.error('❌ Upsert falhou:', upsertErr.message)
  process.exit(1)
}

console.log('✅ Token Helena migrado com sucesso para account_integrations!')
console.log('   provider: helena | account:', account.slug)
