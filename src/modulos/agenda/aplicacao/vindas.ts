import { ErroDeDominio } from '@/compartilhado/erros'
import type { Relogio } from '@/compartilhado/relogio'
import type { StatusDaConsulta } from '@/compartilhado/vocabulario'
import { atorDo, exigirQueCuidaDaAgenda, unidadesVisiveis, veUnidade, type Acesso, type AcessoDoSistema } from '@/modulos/acesso/aplicacao/acesso'
import type { Consulta } from '../dominio/consulta'
import type { casosDaAgenda } from './casos'
import type { LeiturasDaAgenda, UnidadeDeTrabalho, VindaDoCrm, VindaNaLista } from './portas'

// As consultas que o CRM marca fora da agenda (fase 7b): a CRC na Clinicorp, o
// botão, a IA. O módulo do CRM lê o card na hora e pede aqui o que fazer:
//
//   · card em Agendados: sem consulta ligada, a agenda tenta o encaixe sozinha
//     (unidade, dentista e procedimento ligados, cadeira livre); o que faltar
//     deixa a "vinda" na lista, com o motivo, para a recepção. Com consulta
//     ligada e outra data, remarca; se não couber, vira vinda de remarcação;
//   · card fora de Agendados (Cancelados, Faltosos, CRC2): a consulta ligada
//     acompanha, e a vinda pendente é descartada.
//
// Tudo entra pelos casos de uso da agenda com o acesso do sistema de origem
// `crm`, que não manda aviso de volta ao CRM. A recepção, ao encaixar, age como
// ela mesma: o CRM recebe o aviso normal (o card já está lá, e o CRM ignora o
// que não muda).

type CasosDaAgenda = ReturnType<typeof casosDaAgenda>

/** O card em Agendados, como o CRM mostra agora. */
export interface CardAgendadoNoCrm {
  cardId: string
  inicio: Date
  /** O fim da consulta na Clinicorp, quando o CRM marcou lá. */
  fim: Date | null
  telefone: string
  nome: string | null
  crmUnidadeId: string | null
  profissionalNoProntuario: { id: string; nome: string | null } | null
}

export type ResultadoDaVinda =
  | { acao: 'ja_estava'; consultaId: string }
  | { acao: 'encaixada' | 'remarcada'; consultaId: string }
  | { acao: 'na_lista'; vindaId: string; motivo: string }
  | { acao: 'status'; consultaId: string; status: StatusDaConsulta }
  | { acao: 'nada'; motivo: string }

export interface PedidoDeEncaixe {
  profissionalId: string
  procedimentoId: string
  cadeiraId?: string
  /** Outro horário que o da vinda (a recepção combinou outro com o paciente). */
  inicio?: Date
  duracaoMinutos?: number
  /** O nome do paciente, quando o CRM não mandou. */
  nome?: string
}

export interface DependenciasDasVindas {
  uow: UnidadeDeTrabalho
  leituras: LeiturasDaAgenda
  agenda: CasosDaAgenda
  relogio: Relogio
  gerarId?: () => string
}

const ATIVAS: StatusDaConsulta[] = ['agendada', 'confirmada']
const MINUTO = 60_000

/** A duração da Clinicorp, se for uma que a agenda aceita (múltiplo de 5, até 8 horas). */
function duracaoDoProntuario(inicio: Date, fim: Date | null): number | undefined {
  if (!fim) return undefined
  const minutos = Math.round((fim.getTime() - inicio.getTime()) / MINUTO)
  return minutos >= 5 && minutos <= 480 && minutos % 5 === 0 ? minutos : undefined
}

const codigoDe = (erro: unknown) => {
  if (erro instanceof ErroDeDominio) return erro.codigo
  throw erro
}

export function casosDasVindas({ uow, leituras, agenda, relogio, gerarId = () => crypto.randomUUID() }: DependenciasDasVindas) {
  const doCrm = (clinicaId: string): AcessoDoSistema => ({ tipo: 'sistema', clinicaId, origem: 'crm' })
  const sistema = { tipo: 'sistema' as const, id: null }

  /** Grava a vinda pendente do card (nova ou a que já existia), com o motivo. */
  async function deixarNaLista(clinicaId: string, dados: CardAgendadoNoCrm, extra: { tipo: VindaDoCrm['tipo']; unidadeId: string | null; motivo: string; consultaId: string | null }) {
    return uow.executar(async (r) => {
      const existente = await r.vindas.pendenteDoCard(clinicaId, dados.cardId)
      const vinda: VindaDoCrm = {
        id: existente?.id ?? gerarId(),
        clinicaId,
        crmCardId: dados.cardId,
        situacao: 'pendente',
        nome: dados.nome,
        telefone: dados.telefone,
        inicio: dados.inicio,
        fim: dados.fim,
        profissionalNoProntuario: dados.profissionalNoProntuario,
        ...extra,
      }
      await r.vindas.salvar(vinda)
      return vinda
    })
  }

  /** Fecha a vinda pendente do card, se houver. */
  async function fecharPendente(clinicaId: string, cardId: string, resolucao: { situacao: 'encaixada' | 'descartada'; consultaId?: string; motivo?: string }) {
    await uow.executar(async (r) => {
      const pendente = await r.vindas.pendenteDoCard(clinicaId, cardId)
      if (pendente) await r.vindas.resolver(clinicaId, pendente.id, { ...resolucao, ator: sistema, agora: relogio.agora() })
    })
  }

  /** O encaixe sozinho: devolve a consulta, ou o código do que faltou. */
  async function encaixarSozinha(clinicaId: string, dados: CardAgendadoNoCrm): Promise<{ consulta: Consulta } | { motivo: string; unidadeId: string | null }> {
    const { clinica, unidade, profissional } = await uow.executar(async (r) => ({
      clinica: await r.clinicas.obter(clinicaId),
      unidade: dados.crmUnidadeId ? await r.estrutura.unidadePeloCrm(clinicaId, dados.crmUnidadeId) : null,
      profissional: dados.profissionalNoProntuario ? await r.estrutura.profissionalNoProntuario(clinicaId, dados.profissionalNoProntuario.id) : null,
    }))
    const unidadeId = unidade?.id ?? null
    if (!unidade) return { motivo: 'UNIDADE_SEM_VINCULO', unidadeId }
    if (!profissional) return { motivo: dados.profissionalNoProntuario ? 'DENTISTA_SEM_VINCULO' : 'SEM_DENTISTA', unidadeId }
    if (!clinica?.procedimentoDasVindasId) return { motivo: 'SEM_PROCEDIMENTO', unidadeId }
    if (!dados.nome?.trim()) return { motivo: 'SEM_NOME', unidadeId }
    try {
      const { consulta } = await agenda.agendar(doCrm(clinicaId), {
        unidadeId: unidade.id,
        profissionalId: profissional.id,
        procedimentoId: clinica.procedimentoDasVindasId,
        inicio: dados.inicio,
        duracaoMinutos: duracaoDoProntuario(dados.inicio, dados.fim),
        paciente: { nome: dados.nome.trim(), telefone: dados.telefone },
        crmCardId: dados.cardId,
      })
      return { consulta }
    } catch (erro) {
      return { motivo: codigoDe(erro), unidadeId }
    }
  }

  return {
    /** O card está em Agendados no CRM, com esta data: a agenda acompanha. */
    async cardAgendadoNoCrm(clinicaId: string, dados: CardAgendadoNoCrm): Promise<ResultadoDaVinda> {
      const ligada = await uow.executar((r) => r.consultas.ligadaAoCard(clinicaId, dados.cardId, ATIVAS))
      if (ligada) {
        if (ligada.inicio.getTime() === dados.inicio.getTime()) {
          await fecharPendente(clinicaId, dados.cardId, { situacao: 'encaixada', consultaId: ligada.id })
          return { acao: 'ja_estava', consultaId: ligada.id }
        }
        const profissional = dados.profissionalNoProntuario
          ? await uow.executar((r) => r.estrutura.profissionalNoProntuario(clinicaId, dados.profissionalNoProntuario!.id))
          : null
        try {
          await agenda.remarcar(doCrm(clinicaId), ligada.id, {
            inicio: dados.inicio,
            duracaoMinutos: duracaoDoProntuario(dados.inicio, dados.fim),
            ...(profissional ? { profissionalId: profissional.id } : {}),
          })
          await fecharPendente(clinicaId, dados.cardId, { situacao: 'encaixada', consultaId: ligada.id })
          return { acao: 'remarcada', consultaId: ligada.id }
        } catch (erro) {
          const motivo = codigoDe(erro)
          const vinda = await deixarNaLista(clinicaId, dados, { tipo: 'remarcar', unidadeId: ligada.unidadeId, motivo, consultaId: ligada.id })
          return { acao: 'na_lista', vindaId: vinda.id, motivo }
        }
      }

      const encaixe = await encaixarSozinha(clinicaId, dados)
      if ('consulta' in encaixe) {
        // A vinda fica registrada como encaixada, para a recepção saber de onde a consulta veio.
        await uow.executar(async (r) => {
          const pendente = await r.vindas.pendenteDoCard(clinicaId, dados.cardId)
          const vinda: VindaDoCrm = {
            id: pendente?.id ?? gerarId(),
            clinicaId,
            crmCardId: dados.cardId,
            tipo: 'marcar',
            situacao: 'pendente',
            unidadeId: encaixe.consulta.unidadeId,
            nome: dados.nome,
            telefone: dados.telefone,
            inicio: dados.inicio,
            fim: dados.fim,
            profissionalNoProntuario: dados.profissionalNoProntuario,
            motivo: null,
            consultaId: encaixe.consulta.id,
          }
          await r.vindas.salvar(vinda)
          await r.vindas.resolver(clinicaId, vinda.id, { situacao: 'encaixada', consultaId: encaixe.consulta.id, ator: sistema, agora: relogio.agora() })
        })
        return { acao: 'encaixada', consultaId: encaixe.consulta.id }
      }
      const vinda = await deixarNaLista(clinicaId, dados, { tipo: 'marcar', unidadeId: encaixe.unidadeId, motivo: encaixe.motivo, consultaId: null })
      return { acao: 'na_lista', vindaId: vinda.id, motivo: encaixe.motivo }
    },

    /** O card saiu de Agendados no CRM (cancelou, faltou, compareceu): a consulta ligada acompanha. */
    async cardSaiuNoCrm(clinicaId: string, cardId: string, status: 'cancelada' | 'faltou' | 'concluida'): Promise<ResultadoDaVinda> {
      const deQuais: StatusDaConsulta[] = status === 'concluida' ? [...ATIVAS, 'em_atendimento'] : ATIVAS
      const ligada = await uow.executar((r) => r.consultas.ligadaAoCard(clinicaId, cardId, deQuais))
      await fecharPendente(clinicaId, cardId, { situacao: 'descartada', motivo: 'CARD_SAIU_DE_AGENDADOS' })
      if (!ligada) return { acao: 'nada', motivo: 'SEM_CONSULTA_LIGADA' }
      try {
        await agenda.mudarStatus(doCrm(clinicaId), ligada.id, { status, motivo: status === 'cancelada' ? 'Cancelada no CRM' : null })
        return { acao: 'status', consultaId: ligada.id, status }
      } catch (erro) {
        return { acao: 'nada', motivo: codigoDe(erro) }
      }
    },

    /** O card não está mais agendado no CRM (perda, outra coluna): a vinda pendente sai da lista. */
    async cardSemAgendamentoNoCrm(clinicaId: string, cardId: string): Promise<void> {
      await fecharPendente(clinicaId, cardId, { situacao: 'descartada', motivo: 'CARD_SAIU_DE_AGENDADOS' })
    },

    /** A lista "Vindas do CRM": o que espera a recepção, pelo horário. */
    async listar(acesso: Acesso): Promise<VindaNaLista[]> {
      exigirQueCuidaDaAgenda(acesso)
      return leituras.vindasPendentes(acesso.clinicaId, unidadesVisiveis(acesso))
    },

    /** A recepção encaixa a vinda: escolhe o profissional, o procedimento e a cadeira. */
    async encaixar(acesso: Acesso, vindaId: string, pedido: PedidoDeEncaixe): Promise<Consulta> {
      exigirQueCuidaDaAgenda(acesso)
      const vinda = await uow.executar((r) => r.vindas.obter(acesso.clinicaId, vindaId))
      if (!vinda || vinda.situacao !== 'pendente' || (vinda.unidadeId && !veUnidade(acesso, vinda.unidadeId))) {
        throw new ErroDeDominio('nao_encontrado', 'VINDA_NAO_ENCONTRADA', 'Essa consulta do CRM já foi encaixada ou descartada')
      }
      const inicio = pedido.inicio ?? vinda.inicio
      const duracaoMinutos = pedido.duracaoMinutos ?? (pedido.inicio ? undefined : duracaoDoProntuario(vinda.inicio, vinda.fim))
      let consulta: Consulta
      if (vinda.tipo === 'remarcar' && vinda.consultaId) {
        consulta = await agenda.remarcar(acesso, vinda.consultaId, { inicio, duracaoMinutos, profissionalId: pedido.profissionalId, cadeiraId: pedido.cadeiraId })
      } else {
        const nome = pedido.nome?.trim() || vinda.nome?.trim()
        if (!nome) throw new ErroDeDominio('invalido', 'NOME_OBRIGATORIO', 'Informe o nome do paciente')
        if (!vinda.unidadeId) throw new ErroDeDominio('invalido', 'UNIDADE_SEM_VINCULO', 'A unidade do card no CRM não está ligada a uma unidade da agenda')
        ;({ consulta } = await agenda.agendar(acesso, {
          unidadeId: vinda.unidadeId,
          profissionalId: pedido.profissionalId,
          procedimentoId: pedido.procedimentoId,
          cadeiraId: pedido.cadeiraId,
          inicio,
          duracaoMinutos,
          paciente: { nome, telefone: vinda.telefone },
        }))
      }
      await uow.executar(async (r) => {
        await r.vindas.resolver(acesso.clinicaId, vinda.id, { situacao: 'encaixada', consultaId: consulta.id, ator: atorDo(acesso), agora: relogio.agora() })
        // Da próxima vez, o dentista da Clinicorp entra sozinho com este profissional.
        if (vinda.profissionalNoProntuario) await r.estrutura.ligarAoProntuario(acesso.clinicaId, pedido.profissionalId, vinda.profissionalNoProntuario.id)
      })
      return consulta
    },

    /** A recepção tira a vinda da lista sem virar consulta. */
    async descartar(acesso: Acesso, vindaId: string): Promise<void> {
      exigirQueCuidaDaAgenda(acesso)
      await uow.executar(async (r) => {
        const vinda = await r.vindas.obter(acesso.clinicaId, vindaId, { travar: true })
        if (!vinda || vinda.situacao !== 'pendente' || (vinda.unidadeId && !veUnidade(acesso, vinda.unidadeId))) {
          throw new ErroDeDominio('nao_encontrado', 'VINDA_NAO_ENCONTRADA', 'Essa consulta do CRM já foi encaixada ou descartada')
        }
        await r.vindas.resolver(acesso.clinicaId, vinda.id, { situacao: 'descartada', ator: atorDo(acesso), agora: relogio.agora() })
      })
    },
  }
}

export type CasosDasVindas = ReturnType<typeof casosDasVindas>
