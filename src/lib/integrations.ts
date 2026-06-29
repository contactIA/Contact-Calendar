import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { getSupabaseAdmin } from './supabase'

// AES-256-GCM: autenticado, resistente a adulteração.
// Formato do blob: iv(12B) || tag(16B) || ciphertext → base64
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.INTEGRATIONS_ENCRYPTION_KEY
  if (!hex) throw new Error('INTEGRATIONS_ENCRYPTION_KEY não configurada')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('INTEGRATIONS_ENCRYPTION_KEY precisa ter 64 chars hex (32 bytes)')
  return buf
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSecret(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type IntegrationProvider = 'helena' | 'clinicorp'

export interface HelenaSecrets {
  token: string
}

export interface ClinicorpSecrets {
  username: string
  password: string
}

export type IntegrationSecrets = HelenaSecrets | ClinicorpSecrets

export interface Integration {
  id: string
  account_id: string
  provider: IntegrationProvider
  secrets: IntegrationSecrets
  panel_id: string | null
  is_active: boolean
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Retorna a integração descriptografada para uso exclusivo do servidor.
 * Retorna null se não encontrada ou inativa.
 */
export async function getIntegration(
  accountId: string,
  provider: IntegrationProvider
): Promise<Integration | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('account_integrations')
    .select('id, account_id, provider, secrets, panel_id, is_active')
    .eq('account_id', accountId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single()

  if (error || !data) return null

  const encrypted = data.secrets as Record<string, string>
  const decrypted: Record<string, string> = {}
  for (const [k, v] of Object.entries(encrypted)) {
    decrypted[k] = decryptSecret(v)
  }

  return {
    id: data.id,
    account_id: data.account_id,
    provider: data.provider as IntegrationProvider,
    secrets: decrypted as unknown as IntegrationSecrets,
    panel_id: data.panel_id,
    is_active: data.is_active,
  }
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza a integração. Cifra todos os campos de secrets antes de gravar.
 */
export async function upsertIntegration(
  accountId: string,
  provider: IntegrationProvider,
  secrets: IntegrationSecrets,
  panelId?: string
): Promise<void> {
  const encrypted: Record<string, string> = {}
  for (const [k, v] of Object.entries(secrets)) {
    encrypted[k] = encryptSecret(v)
  }

  const { error } = await getSupabaseAdmin()
    .from('account_integrations')
    .upsert(
      {
        account_id: accountId,
        provider,
        secrets: encrypted,
        panel_id: panelId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,provider' }
    )

  if (error) throw new Error(`upsertIntegration falhou: ${error.message}`)
}
