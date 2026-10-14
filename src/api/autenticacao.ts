import { createMiddleware } from 'hono/factory'
import { ErroDeDominio } from '@/compartilhado/erros'
import type { Ambiente } from './ambiente'

// Quem pede, resolvido antes da rota, como no CRM:
//
//   · X-Agenda-Sessao: o token da tela, que a página recebe ao abrir pelo item de
//     menu da plataforma. Vai em cabeçalho, não em cookie: dentro do iframe da
//     plataforma o cookie de terceiro é bloqueado ou particionado conforme o
//     navegador;
//   · Authorization: Bearer agd_...: a chave do agente de IA ou de uma integração;
//   · X-Clinica (opcional): a clínica do pedido, pelo id ou pelo companyId da
//     plataforma. A sessão e a chave são de uma clínica só, então o cabeçalho só
//     confere.

export const exigirAcesso = createMiddleware<Ambiente>(async (c, next) => {
  const clinicaPedida = c.req.header('x-clinica')?.trim() || undefined
  const sessao = c.req.header('x-agenda-sessao')?.trim()
  const autorizacao = c.req.header('authorization')?.trim()
  if (sessao) {
    c.set('acesso', await c.get('casos').acesso.autenticarSessao(sessao, clinicaPedida))
  } else if (autorizacao && /^bearer\s+/i.test(autorizacao)) {
    c.set('acesso', await c.get('casos').acesso.autenticarChave(autorizacao.replace(/^bearer\s+/i, ''), clinicaPedida))
  } else {
    throw new ErroDeDominio('nao_autenticado', 'SEM_CREDENCIAL', 'Envie a chave da API no cabeçalho Authorization: Bearer <chave>')
  }
  await next()
})
