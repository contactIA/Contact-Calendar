import type { Relogio } from '@/compartilhado/relogio'
import { bancoResponde, obterBanco, type Banco } from '@/infra/banco/conexao'
import { lerHosts } from '@/modulos/acesso/aplicacao/acesso'
import { casosDeAcesso } from '@/modulos/acesso/aplicacao/casos'
import {
  assinadorHmac,
  assinadorIndisponivel,
  limitadorEmMemoria,
  repositorioDeAcessoPostgres,
  segredosNode,
} from '@/modulos/acesso/infraestrutura/adaptadores'
import { casosDosCadastros } from '@/modulos/cadastros/aplicacao/casos'
import { cadastrosNoPostgres } from '@/modulos/cadastros/infraestrutura/repositorio-postgres'
import { casosDaAgenda } from '@/modulos/agenda/aplicacao/casos'
import { casosDasVindas } from '@/modulos/agenda/aplicacao/vindas'
import { leiturasDaAgendaPostgres } from '@/modulos/agenda/infraestrutura/leituras-postgres'
import { unidadeDeTrabalhoPostgres } from '@/modulos/agenda/infraestrutura/repositorios-postgres'
import { casosDoCrm } from '@/modulos/crm/aplicacao/casos'
import { casosDaEntradaDoCrm } from '@/modulos/crm/aplicacao/entrada'
import type { ApiDoCrm, Cifra } from '@/modulos/crm/aplicacao/portas'
import { apiDoCrmHttp, lerConfiguracaoDoCrm } from '@/modulos/crm/infraestrutura/api-do-crm-http'
import { caixaDoCrmPostgres } from '@/modulos/crm/infraestrutura/caixa-postgres'
import { assinadorDoCrm, cifraDoEnv, clinicasNoCrmPostgres, entradasDoCrmPostgres } from '@/modulos/crm/infraestrutura/entrada-postgres'

// Raiz de composição (ADR 0001, como no CRM): o único lugar que liga cada porta
// ao seu adaptador. As rotas da API, as páginas e o worker pedem os casos de uso
// daqui, nunca montam adaptadores sozinhos.
//
// Os testes montam o mesmo conjunto com outro banco (PGlite), outro relógio e
// adaptadores de mentira: é só passar as dependências.

/** A sessão da tela (o login pelo item de menu), lida do .env pelo processo. */
export interface AmbienteDaSessao {
  /** AGENDA_SEGREDO_SESSAO; sem ele, ninguém entra pela tela. */
  segredoDaSessao: string | null
  /** EMBED_HOSTS, já limpos. */
  hostsDaPlataforma: string[]
  /** Em produção, sem EMBED_HOSTS ninguém entra. */
  exigirHostsDaPlataforma: boolean
}

export interface Dependencias {
  banco: Banco
  relogio: Relogio
  gerarId?: () => string
  /** Sem ela (os testes que não usam a tela), a sessão fica fechada. */
  sessao?: AmbienteDaSessao
  /** A API do CRM (CRM_URL e CRM_CHAVE); sem ela, os avisos ao CRM esperam na caixa de saída. */
  apiDoCrm?: ApiDoCrm | null
  /** AGENDA_URL: o endereço público da agenda, para o webhook do CRM. */
  urlDaAgenda?: string | null
  /** Sem ela, a do .env (AGENDA_CHAVE_CIFRAGEM). */
  cifra?: Cifra
}

export function lerAmbienteDaSessao(env = process.env): AmbienteDaSessao {
  return {
    segredoDaSessao: env.AGENDA_SEGREDO_SESSAO || null,
    hostsDaPlataforma: lerHosts(env.EMBED_HOSTS),
    exigirHostsDaPlataforma: env.NODE_ENV === 'production',
  }
}

export function montarCasosDeUso({ banco, relogio, gerarId, sessao, apiDoCrm = null, urlDaAgenda = null, cifra = cifraDoEnv }: Dependencias) {
  const uow = unidadeDeTrabalhoPostgres(banco)
  const leituras = leiturasDaAgendaPostgres(banco)
  const agenda = casosDaAgenda({ uow, leituras, relogio, gerarId })
  const vindas = casosDasVindas({ uow, leituras, agenda, relogio, gerarId })
  return {
    sistema: {
      bancoResponde: () => bancoResponde(banco),
    },
    acesso: casosDeAcesso({
      repositorio: repositorioDeAcessoPostgres(banco),
      segredos: segredosNode,
      relogio,
      gerarId,
      // Sem o segredo, nenhum token sai nem entra: falha fechada.
      assinador: sessao?.segredoDaSessao ? assinadorHmac(sessao.segredoDaSessao) : assinadorIndisponivel,
      limitador: limitadorEmMemoria(),
      configuracao: {
        hostsDaPlataforma: sessao?.hostsDaPlataforma ?? [],
        exigirHostsDaPlataforma: sessao?.exigirHostsDaPlataforma ?? true,
      },
    }),
    cadastros: casosDosCadastros({ banco: cadastrosNoPostgres(banco), gerarId }),
    agenda,
    vindas,
    crm: {
      ...casosDoCrm({ caixa: caixaDoCrmPostgres(banco), api: apiDoCrm, relogio }),
      ...casosDaEntradaDoCrm({
        api: apiDoCrm,
        entradas: entradasDoCrmPostgres(banco),
        clinicas: clinicasNoCrmPostgres(banco),
        vindas,
        cifra,
        assinador: assinadorDoCrm,
        relogio,
        urlDaAgenda,
      }),
    },
  }
}

export type CasosDeUso = ReturnType<typeof montarCasosDeUso>

const relogio: Relogio = { agora: () => new Date() }

let padrao: CasosDeUso | null = null

/** Os casos de uso do processo, montados no primeiro pedido: o build não precisa de banco nem de segredo. */
export function casosDeUso(): CasosDeUso {
  if (!padrao) {
    const crm = lerConfiguracaoDoCrm()
    padrao = montarCasosDeUso({
      banco: obterBanco(),
      relogio,
      sessao: lerAmbienteDaSessao(),
      apiDoCrm: crm ? apiDoCrmHttp(crm) : null,
      urlDaAgenda: process.env.AGENDA_URL?.trim().replace(/\/+$/, '') || null,
    })
  }
  return padrao
}
