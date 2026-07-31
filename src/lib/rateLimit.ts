// ============================================================================
// Rate limit simples em memória, por chave (ex.: IP). Janela deslizante fixa.
//
// Uso previsto: proteger endpoints públicos sem auth (ex.: onboarding) contra
// abuso/criação em massa. NÃO substitui um rate-limit distribuído (Redis) —
// é por processo/instância. Para uma VPS single-instance com PM2 fork, cobre
// o abuso básico. Se escalar para múltiplas instâncias, migrar para Redis.
// ============================================================================

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Limpeza preguiçosa: remove buckets expirados quando o mapa cresce.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

// Retorna true se a requisição PODE prosseguir; false se estourou o limite.
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

// Extrai um identificador de cliente da request (IP via headers de proxy).
export function clientKey(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
