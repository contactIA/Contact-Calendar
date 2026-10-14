import { headers } from 'next/headers'
import { casosDeUso } from '@/composicao'
import { Entrada, type ResultadoDaEntradaNaTela } from '@/componentes/entrada'

// A entrada pelo item de menu da plataforma (ADR 0001, como no CRM): a URL traz
// ?companyId={{companyId}}&userId={{userId}}. A conferência (origem, clínica,
// usuário vinculado, tentativas) acontece aqui, no servidor, com os cabeçalhos da
// navegação; a tela recebe só o token da sessão.

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null)

export default async function Inicio(props: PageProps<'/'>) {
  const parametros = await props.searchParams
  const companyId = texto(parametros.companyId)
  const userId = texto(parametros.userId)
  if (!companyId && !userId) return <Entrada resultado={{ tipo: 'sem_parametros' }} />

  const h = await headers()
  const ip = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido'
  let resultado: ResultadoDaEntradaNaTela
  try {
    const entrada = await casosDeUso().acesso.entrarPeloMenu({ companyId, userId, referer: h.get('referer'), destino: h.get('sec-fetch-dest'), ip })
    resultado = entrada.tipo === 'ok' ? { tipo: 'ok', token: entrada.token } : { tipo: 'recusada', motivo: entrada.motivo }
  } catch (erro) {
    console.error('[entrada] falhou', erro)
    resultado = { tipo: 'recusada', motivo: 'indisponivel' }
  }
  return <Entrada resultado={resultado} />
}
