import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt, type JwtPayload } from '@/lib/auth'

export type ApiContext = {
  user: JwtPayload
}

type RouteParams = { params: Promise<Record<string, string>> }
type Handler = (req: NextRequest, ctx: ApiContext, params: Record<string, string>) => Promise<NextResponse>

// Wrapper que extrai e valida o JWT em toda route protegida
export function withAuth(handler: Handler, allowedRoles?: JwtPayload['role'][]) {
  return async (req: NextRequest, routeCtx?: RouteParams) => {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    let payload: JwtPayload

    try {
      payload = await verifyJwt(token)
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = routeCtx?.params ? await routeCtx.params : {}
    return handler(req, { user: payload }, params)
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}
