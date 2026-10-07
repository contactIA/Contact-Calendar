import type { Relogio } from '@/compartilhado/relogio'
import { bancoResponde, obterBanco, type Banco } from '@/infra/banco/conexao'
import { casosDaAgenda } from '@/modulos/agenda/aplicacao/casos'
import { leiturasDaAgendaPostgres } from '@/modulos/agenda/infraestrutura/leituras-postgres'
import { unidadeDeTrabalhoPostgres } from '@/modulos/agenda/infraestrutura/repositorios-postgres'

// Raiz de composição (ADR 0001, como no CRM): o único lugar que liga cada porta
// ao seu adaptador. As rotas da API, as páginas e o worker pedem os casos de uso
// daqui, nunca montam adaptadores sozinhos.
//
// Os testes montam o mesmo conjunto com outro banco (PGlite), outro relógio e
// adaptadores de mentira: é só passar as dependências.

export interface Dependencias {
  banco: Banco
  relogio: Relogio
  gerarId?: () => string
}

export function montarCasosDeUso({ banco, relogio, gerarId }: Dependencias) {
  return {
    sistema: {
      bancoResponde: () => bancoResponde(banco),
    },
    agenda: casosDaAgenda({ uow: unidadeDeTrabalhoPostgres(banco), leituras: leiturasDaAgendaPostgres(banco), relogio, gerarId }),
  }
}

export type CasosDeUso = ReturnType<typeof montarCasosDeUso>

const relogio: Relogio = { agora: () => new Date() }

let padrao: CasosDeUso | null = null

/** Os casos de uso do processo, montados no primeiro pedido: o build não precisa de banco nem de segredo. */
export function casosDeUso(): CasosDeUso {
  padrao ??= montarCasosDeUso({ banco: obterBanco(), relogio })
  return padrao
}
