import { NextRequest, NextResponse } from 'next/server'
import { authenticateAiAgent, type JwtPayload } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { err } from '@/lib/api'

export type AgentContext = { user: JwtPayload }
type AgentHandler = (req: NextRequest, ctx: AgentContext) => Promise<NextResponse>

/**
 * Middleware para endpoints do agente de IA.
 * Aceita: Authorization: Bearer <api_key>  +  X-Account-ID: <account_id>
 * Não exige JWT pré-existente — valida a API Key diretamente.
 */
export function withAgentAuth(handler: AgentHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authHeader = req.headers.get('authorization')
    const accountId  = req.headers.get('x-account-id')

    if (!authHeader?.startsWith('Bearer ') || !accountId) {
      return err('Authorization e X-Account-ID são obrigatórios', 401)
    }

    const apiKey = authHeader.slice(7)
    const result = await authenticateAiAgent(apiKey, accountId)
    if (!result) return err('API Key inválida', 401)

    // Usa o payload retornado pela autenticação — sem reverificar o JWT.
    return handler(req, { user: { ...result.payload } })
  }
}

/** Normaliza telefone para somente dígitos */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export type PhoneMatch =
  | { status: 'none' }
  | { status: 'one'; id: string; name: string }
  | { status: 'many' }

/**
 * Resolve um paciente pelo telefone comparando apenas dígitos (via RPC
 * find_patients_by_phone). Distingue três casos para que o chamador trate
 * ambiguidade de forma explícita em vez de escolher um paciente às cegas:
 *   - 'none': nenhum paciente
 *   - 'one' : exatamente um (id + name)
 *   - 'many': mais de um candidato com o mesmo telefone
 */
export async function findPatientByPhone(accountId: string, phone: string): Promise<PhoneMatch> {
  const { data, error } = await supabaseAdmin.rpc('find_patients_by_phone', {
    p_account_id: accountId,
    p_phone:      phone,
  })
  if (error) throw new Error(error.message)
  if (!data?.length) return { status: 'none' }
  if (data.length > 1) return { status: 'many' }
  return { status: 'one', id: data[0].id, name: data[0].name }
}
