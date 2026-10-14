import { NextResponse, type NextRequest } from 'next/server'
import { lerHosts } from '@/modulos/acesso/aplicacao/acesso'

// Cabeçalhos de segurança de toda resposta, como no CRM.
//
// A agenda abre dentro da plataforma, num iframe. Quem pode embutir a agenda é
// dito pelo cabeçalho CSP frame-ancestors, que o navegador cumpre: só os hosts da
// plataforma (EMBED_HOSTS). É lido na hora de cada pedido, então mudar o .env e
// reiniciar basta, sem nova build. Nunca pôr X-Frame-Options: ele impediria o iframe.

export function proxy(_request: NextRequest) {
  const resposta = NextResponse.next()
  const hosts = lerHosts(process.env.EMBED_HOSTS)
  const ancestrais = ["'self'", ...hosts.flatMap((h) => [`https://${h}`, `https://*.${h}`])].join(' ')
  resposta.headers.set('Content-Security-Policy', `frame-ancestors ${ancestrais}`)
  resposta.headers.set('X-Content-Type-Options', 'nosniff')
  resposta.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  resposta.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return resposta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
