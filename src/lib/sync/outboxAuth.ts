import { createHash, timingSafeEqual } from 'node:crypto'

// ============================================================================
// Autenticacao do endpoint interno do Outbox Worker (TASK-020, ADR-020-5).
// Isolado do route.ts para ser testavel sem o runtime do Next.
// ============================================================================

export type AuthVerdict =
  | { ok: true }
  | { ok: false; status: 503 | 401 }

// Extrai o segredo apresentado: Authorization: Bearer <x> (padrao Vercel Cron)
// ou x-outbox-secret: <x>. getHeader e case-insensitive por contrato.
export function extractSecret(getHeader: (name: string) => string | null): string | null {
  const auth = getHeader('authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  const header = getHeader('x-outbox-secret')
  if (header) return header
  return null
}

// Comparacao constante no tempo. Hash SHA-256 dos dois lados iguala o
// comprimento dos buffers (timingSafeEqual exige tamanhos iguais) e nao vaza
// o tamanho do segredo nem permite timing attack por prefixo.
export function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// Decisao de auth pura. expected = process.env.OUTBOX_SECRET.
//   sem expected           -> 503 (fail-closed)
//   sem/ invalido provided  -> 401
//   valido                 -> ok
export function authorizeTick(
  expected: string | undefined,
  getHeader: (name: string) => string | null,
): AuthVerdict {
  if (!expected) return { ok: false, status: 503 }
  const provided = extractSecret(getHeader)
  if (!provided || !secretMatches(provided, expected)) return { ok: false, status: 401 }
  return { ok: true }
}
