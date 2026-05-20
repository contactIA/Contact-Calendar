import { NextRequest, NextResponse } from 'next/server'
import { authenticateAiAgent, verifyJwt, type JwtPayload } from '@/lib/auth'
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
    const result  = await authenticateAiAgent(apiKey, accountId)
    if (!result) return err('API Key inválida', 401)

    const user = await verifyJwt(result.token)
    return handler(req, { user })
  }
}

/** Normaliza telefone para somente dígitos */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}
