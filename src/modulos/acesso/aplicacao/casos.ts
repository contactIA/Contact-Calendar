import { ErroDeDominio } from '@/compartilhado/erros'
import type { Relogio } from '@/compartilhado/relogio'
import { CADENCIAS_DA_GRADE, type TipoDeChaveApi } from '@/compartilhado/vocabulario'
import { exigirGestor, type Acesso, type AcessoDeChave, type AcessoDeUsuario, type Papeis } from '../dominio/acesso'
import { conferirEntrada, temAlgumPapel, type MotivoDeRecusa, type PedidoDeEntrada } from '../dominio/entrada'
import type {
  AssinadorDeTokens,
  ChaveGuardada,
  ClinicaDaSessao,
  ConfiguracaoDaEntrada,
  LimitadorDeTentativas,
  RepositorioDeAcesso,
  Segredos,
} from './portas'

// Quem pede e como, como no CRM (ADR 0002 de lá):
//
//   · a tela: a URL do item de menu traz companyId e userId; a agenda confere a
//     origem, acha o usuário que a clínica vinculou e devolve um token de sessão
//     assinado, que a página manda em cada chamada (cabeçalho X-Agenda-Sessao);
//   · o agente de IA e as integrações: uma chave da API. A chave entra pelo hash:
//     a agenda nunca guarda o texto dela, e quem a cria vê o texto uma vez só.
//     Diferente do CRM, cada chave é de uma clínica só (docs/modelo-de-dados.md,
//     "chaves_api").
//
// Servir a clínica errada é pior que não servir nada: toda divergência entre o
// que o pedido declara e o que a credencial permite é recusada.

/** A sessão da tela dura um expediente: depois, a pessoa abre de novo pelo menu. */
export const DURACAO_DA_SESSAO_S = 12 * 60 * 60

export interface DependenciasDeAcesso {
  repositorio: RepositorioDeAcesso
  segredos: Segredos
  relogio: Relogio
  assinador: AssinadorDeTokens
  limitador: LimitadorDeTentativas
  configuracao: ConfiguracaoDaEntrada
  gerarId?: () => string
}

export type MotivoDaEntradaRecusada = MotivoDeRecusa | 'clinica_nao_cadastrada' | 'usuario_sem_papel' | 'muitas_tentativas'

export type ResultadoDaEntrada =
  | { tipo: 'ok'; token: string; expiraEm: Date; usuario: { nome: string; papeis: Papeis } }
  | { tipo: 'recusada'; motivo: MotivoDaEntradaRecusada }

/** Quem está usando a tela, e a clínica: o que a tela precisa para se montar. */
export interface Eu {
  usuario: { id: string; nome: string; papeis: Papeis; profissionalId: string | null; unidades: string[] }
  clinica: Omit<ClinicaDaSessao, 'ativa'>
}

interface DadosDaSessao {
  v: 1
  t: 'u'
  c: string
  u: string
  exp: number
}

/** O que a tela mostra de uma chave: nunca o hash nem o texto. */
export type ChaveDaClinica = Omit<ChaveGuardada, 'clinicaId'>

const semClinica = ({ clinicaId: _, ...chave }: ChaveGuardada): ChaveDaClinica => chave

const chaveInvalida = () => new ErroDeDominio('nao_autenticado', 'CHAVE_INVALIDA', 'Chave da API inválida ou revogada')

const naoAutenticado = (frase = 'Sessão expirada. Abra a agenda de novo pelo menu da plataforma.') =>
  new ErroDeDominio('nao_autenticado', 'NAO_AUTENTICADO', frase)

const segundos = (d: Date) => Math.floor(d.getTime() / 1000)

export function casosDeAcesso({
  repositorio,
  segredos,
  relogio,
  assinador,
  limitador,
  configuracao,
  gerarId = () => crypto.randomUUID(),
}: DependenciasDeAcesso) {
  /** Quem está usando a tela. Só a sessão de uma pessoa: a chave não tem "eu". */
  async function eu(acesso: Acesso): Promise<Eu> {
    if (acesso.tipo !== 'usuario') {
      throw new ErroDeDominio('proibido', 'SO_PELA_TELA', 'Esta rota é da tela: abra a agenda pelo menu da plataforma')
    }
    const clinica = await repositorio.clinicaDaSessao(acesso.clinicaId)
    if (!clinica) throw naoAutenticado('Esta clínica não está ativa na agenda')
    const { ativa: _, ...semAtiva } = clinica
    return {
      usuario: {
        id: acesso.usuarioId,
        nome: acesso.nome,
        papeis: acesso.papeis,
        profissionalId: acesso.profissionalId,
        unidades: acesso.unidades ?? [],
      },
      clinica: semAtiva,
    }
  }

  return {
    eu,

    /**
     * A entrada pelo item de menu (?companyId=…&userId=…). Recusa sem lançar: a
     * página mostra o recado de cada motivo. Lança só quando o servidor não está
     * configurado para receber ninguém.
     */
    async entrarPeloMenu(pedido: PedidoDeEntrada & { ip: string }): Promise<ResultadoDaEntrada> {
      const agora = relogio.agora()
      if (!limitador.tentar(`entrada:${pedido.ip}`, agora)) return { tipo: 'recusada', motivo: 'muitas_tentativas' }
      if (configuracao.exigirHostsDaPlataforma && configuracao.hostsDaPlataforma.length === 0) {
        throw new ErroDeDominio('indisponivel', 'SEM_HOSTS_DA_PLATAFORMA', 'O servidor não tem a lista de hosts da plataforma (EMBED_HOSTS)')
      }

      const recusa = conferirEntrada(pedido, configuracao.hostsDaPlataforma)
      if (recusa) return { tipo: 'recusada', motivo: recusa }

      const clinica = await repositorio.clinica(pedido.companyId!)
      // Só pelo companyId: o id interno da clínica não está na URL do menu.
      if (!clinica || clinica.companyId !== pedido.companyId!.toLowerCase() || !clinica.ativa) {
        return { tipo: 'recusada', motivo: 'clinica_nao_cadastrada' }
      }

      const usuario = await repositorio.usuarioDaPlataforma(clinica.id, pedido.userId!)
      if (!usuario || !usuario.ativo || !temAlgumPapel(usuario.papeis)) {
        // Sem o id completo no log: quem lê o log não precisa dele.
        const u = pedido.userId!
        console.warn(`[acesso] usuário sem papel na clínica ${clinica.id}: ${u.slice(0, 4)}…${u.slice(-4)}`)
        return { tipo: 'recusada', motivo: 'usuario_sem_papel' }
      }

      const expiraEm = new Date(agora.getTime() + DURACAO_DA_SESSAO_S * 1000)
      const dados: DadosDaSessao = { v: 1, t: 'u', c: clinica.id, u: usuario.id, exp: segundos(expiraEm) }
      return { tipo: 'ok', token: assinador.assinar({ ...dados }), expiraEm, usuario: { nome: usuario.nome, papeis: usuario.papeis } }
    },

    /**
     * O token da tela. Os papéis são lidos do banco a cada pedido: tirar um papel
     * ou desativar o usuário vale na hora, sem esperar o token vencer.
     */
    async autenticarSessao(token: string, clinicaPedida?: string): Promise<AcessoDeUsuario> {
      const dados = assinador.verificar(token) as Partial<DadosDaSessao> | null
      if (!dados || dados.v !== 1 || dados.t !== 'u' || !dados.c || !dados.u || !dados.exp) throw naoAutenticado()
      if (dados.exp <= segundos(relogio.agora())) throw naoAutenticado()
      if (clinicaPedida) {
        const declarada = await repositorio.clinica(clinicaPedida)
        if (declarada?.id !== dados.c) throw new ErroDeDominio('proibido', 'CLINICA_DIVERGENTE', 'A sessão é de outra clínica')
      }
      const clinica = await repositorio.clinica(dados.c)
      if (!clinica?.ativa) throw naoAutenticado('Esta clínica não está ativa na agenda')
      const usuario = await repositorio.usuario(dados.c, dados.u)
      if (!usuario?.ativo || !temAlgumPapel(usuario.papeis)) throw naoAutenticado('Seu usuário não tem mais acesso à agenda')
      return {
        tipo: 'usuario',
        clinicaId: dados.c,
        usuarioId: usuario.id,
        nome: usuario.nome,
        papeis: usuario.papeis,
        profissionalId: usuario.profissionalId,
        unidades: usuario.unidades,
      }
    },

    /**
     * A cadência da grade: de quanto em quanto tempo a agenda oferece um início.
     * Só o gestor. A duração continua a do procedimento.
     */
    async alterarCadencia(acesso: Acesso, minutos: number): Promise<Eu> {
      exigirGestor(acesso)
      if (!(CADENCIAS_DA_GRADE as readonly number[]).includes(minutos)) {
        throw new ErroDeDominio('invalido', 'CADENCIA_INVALIDA', `A cadência é de ${CADENCIAS_DA_GRADE.join(', ')} minutos`)
      }
      await repositorio.definirCadencia(acesso.clinicaId, minutos)
      return eu(acesso)
    },

    /**
     * A chave da API (cabeçalho Authorization: Bearer agd_...). O X-Clinica é
     * opcional; quando vem, tem de ser a clínica da chave, pelo id ou pelo
     * companyId da conta.
     */
    async autenticarChave(texto: string, clinicaPedida?: string): Promise<AcessoDeChave> {
      const chave = await repositorio.chavePorHash(segredos.hashDaChave(texto))
      if (!chave || chave.revogadaEm) throw chaveInvalida()
      if (clinicaPedida) {
        const pedida = await repositorio.clinica(clinicaPedida)
        if (pedida?.id !== chave.clinicaId) {
          throw new ErroDeDominio('proibido', 'CLINICA_FORA_DA_CHAVE', 'Esta chave não alcança a clínica pedida')
        }
      }
      const clinica = await repositorio.clinica(chave.clinicaId)
      if (!clinica?.ativa) throw new ErroDeDominio('proibido', 'CLINICA_INATIVA', 'Esta clínica não está ativa na agenda')
      await repositorio.registrarUsoDaChave(chave.id, relogio.agora())
      return { tipo: chave.tipo, clinicaId: chave.clinicaId, chaveId: chave.id, nome: chave.nome, podeEscrever: chave.podeEscrever }
    },

    async listarChaves(acesso: Acesso): Promise<ChaveDaClinica[]> {
      exigirGestor(acesso)
      return (await repositorio.chavesDaClinica(acesso.clinicaId)).map(semClinica)
    },

    /** Devolve o texto da chave, que não aparece de novo. */
    async criarChave(acesso: Acesso, pedido: { nome: string; tipo: TipoDeChaveApi; podeEscrever: boolean }) {
      exigirGestor(acesso)
      const nome = pedido.nome.trim()
      if (!nome) throw new ErroDeDominio('invalido', 'NOME_OBRIGATORIO', 'Dê um nome à chave, para saber quem a usa')
      const texto = segredos.novaChave()
      const chave: ChaveGuardada = {
        id: gerarId(),
        clinicaId: acesso.clinicaId,
        nome,
        tipo: pedido.tipo,
        prefixo: texto.slice(0, 12),
        podeEscrever: pedido.podeEscrever,
        criadoEm: relogio.agora(),
        ultimoUsoEm: null,
        revogadaEm: null,
      }
      await repositorio.criarChave({ ...chave, hash: segredos.hashDaChave(texto) })
      return { ...semClinica(chave), chave: texto }
    },

    async revogarChave(acesso: Acesso, chaveId: string): Promise<void> {
      exigirGestor(acesso)
      if (!(await repositorio.revogarChave(acesso.clinicaId, chaveId, relogio.agora()))) {
        throw new ErroDeDominio('nao_encontrado', 'CHAVE_NAO_ENCONTRADA', 'Chave não encontrada')
      }
    },
  }
}

export type CasosDeAcesso = ReturnType<typeof casosDeAcesso>
