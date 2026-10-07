import { bancoResponde, obterBanco, type Banco } from '@/infra/banco/conexao'

// Raiz de composição (ADR 0001, como no CRM): o único lugar que liga cada porta
// ao seu adaptador. As rotas da API, as páginas e o worker pedem os casos de uso
// daqui, nunca montam adaptadores sozinhos.
//
// Os testes montam o mesmo conjunto com outro banco (PGlite), outro relógio e
// adaptadores de mentira: é só passar as dependências.

export interface Dependencias {
  banco: Banco
}

export function montarCasosDeUso({ banco }: Dependencias) {
  return {
    sistema: {
      bancoResponde: () => bancoResponde(banco),
    },
  }
}

export type CasosDeUso = ReturnType<typeof montarCasosDeUso>

let padrao: CasosDeUso | null = null

/** Os casos de uso do processo, montados no primeiro pedido: o build não precisa de banco nem de segredo. */
export function casosDeUso(): CasosDeUso {
  padrao ??= montarCasosDeUso({ banco: obterBanco() })
  return padrao
}
