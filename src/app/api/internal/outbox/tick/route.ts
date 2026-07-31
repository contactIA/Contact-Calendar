import { NextRequest, NextResponse } from 'next/server'
import { authorizeTick } from '@/lib/sync/outboxAuth'
import { processOutbox } from '@/lib/sync/outboxWorker'

// ============================================================================
// POST /api/internal/outbox/tick — gatilho do Outbox Worker (TASK-020).
//
// Chamado pelo Vercel Cron a cada 1 min (ver vercel.json). Endpoint INTERNO:
// protegido por segredo, nunca exposto ao publico. Ver ADR-020-5.
//
// Auth (ver src/lib/sync/outboxAuth.ts), qualquer um dos dois headers:
//   - Authorization: Bearer <OUTBOX_SECRET>   (padrao do Vercel Cron)
//   - x-outbox-secret: <OUTBOX_SECRET>         (chamada manual / outro scheduler)
//
// Regras: fail-closed 503 sem segredo no ambiente; 401 generico (timing-safe);
// so POST; runtime nodejs (node:crypto + service_role do Supabase).
// ============================================================================

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const verdict = authorizeTick(process.env.OUTBOX_SECRET, (h) => req.headers.get(h))
  if (!verdict.ok) {
    const msg = verdict.status === 503 ? 'service unavailable' : 'unauthorized'
    return NextResponse.json({ error: msg }, { status: verdict.status })
  }

  try {
    const result = await processOutbox()
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    // Nao vaza stack/detalhe interno na resposta; loga no servidor.
    console.error('[outbox/tick] processOutbox falhou:', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

// Qualquer outro metodo: 405 (o cron so faz POST).
export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 })
}
