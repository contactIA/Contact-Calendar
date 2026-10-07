import { handle } from 'hono/vercel'
import { criarApi } from '@/api/app'

// A API nova (/api/v1/*, /api/docs, /api/openapi.json) é um app Hono, montado
// aqui. Esta rota só entrega a requisição: validação, documentação e erros ficam
// em src/api. As rotas antigas, em pastas próprias de src/app/api, têm
// precedência sobre esta enquanto existirem.

const api = criarApi()

export const GET = handle(api)
export const POST = handle(api)
export const PUT = handle(api)
export const PATCH = handle(api)
export const DELETE = handle(api)
// A pergunta prévia do CORS, que o "Try It" da documentação faz antes de chamar.
export const OPTIONS = handle(api)
