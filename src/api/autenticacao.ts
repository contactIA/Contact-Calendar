import { createMiddleware } from 'hono/factory'
import { ErroDeDominio } from '@/compartilhado/erros'
import type { Ambiente } from './ambiente'

// Quem pede, resolvido antes da rota, como no CRM:
//
//   · Authorization: Bearer agd_...: a chave do agente de IA ou de uma integração;
//   · X-Clinica (opcional): a clínica do pedido, pelo id ou pelo companyId da
//     plataforma. A chave é de uma clínica só, então o cabeçalho só confere.
//
// O token da tela, que a página recebe ao abrir pelo item de menu, entra aqui na
// fase 8. Vai em cabeçalho, não em cookie: dentro do iframe da plataforma o
// cookie de terceiro é bloqueado ou particionado conforme o navegador.

export const exigirAcesso = createMiddleware<Ambiente>(async (c, next) => {
  const clinicaPedida = c.req.header('x-clinica')?.trim() || undefined
  const autorizacao = c.req.header('authorization')?.trim()
  if (!autorizacao || !/^bearer\s+/i.test(autorizacao)) {
    throw new ErroDeDominio('nao_autenticado', 'SEM_CREDENCIAL', 'Envie a chave da API no cabeçalho Authorization: Bearer <chave>')
  }
  c.set('acesso', await c.get('casos').acesso.autenticarChave(autorizacao.replace(/^bearer\s+/i, ''), clinicaPedida))
  await next()
})
