import { ErroDeDominio } from '@/compartilhado/erros'
import { diaDaSemana, diaNoFuso, instanteNoFuso, diaSeguinte, lerData } from '@/compartilhado/fuso'
import type { Relogio } from '@/compartilhado/relogio'
import { normalizarTelefone } from '@/compartilhado/telefone'
import type { StatusDaConsulta } from '@/compartilhado/vocabulario'
import {
  atorDo,
  cuidaDaAgenda,
  ehChave,
  exigirEscrita,
  exigirQueCuidaDaAgenda,
  profissionalVisivel,
  unidadesVisiveis,
  veUnidade,
  type Acesso,
} from '@/modulos/acesso/aplicacao/acesso'
import {
  avisosDaMudanca,
  avisosDaRemarcacao,
  avisosDoAgendamento,
  exigirRemarcavel,
  mudarStatus as mudarStatusDaConsulta,
  type Aviso,
  type Consulta,
  type QuemMuda,
} from '../dominio/consulta'
import { conferirHorario, horariosLivres as calcularHorariosLivres, janelasDoExpediente, type HorarioLivre, type Janela } from '../dominio/disponibilidade'
import { conferirDadosDoPaciente, escolherPaciente, normalizarNome, pacienteAmbiguo, type DadosDoPaciente, type Paciente } from '../dominio/paciente'
import { motivoDaRecomendacao, ordenarProfissionais } from '../dominio/recomendacao'
import type {
  ClinicaDaAgenda,
  ConsultaNaAgenda,
  LeiturasDaAgenda,
  NovoAviso,
  PacienteEncontrado,
  Procedimento,
  ProfissionalDaUnidade,
  Repositorios,
  UnidadeDeTrabalho,
  Unidade,
} from './portas'

// Os casos de uso da agenda (ADR 0001). A tela e o agente de IA chamam os mesmos:
// a regra é uma só. Toda escrita grava a mudança, o evento do histórico e os
// avisos para o CRM e a plataforma na mesma transação.

export interface DependenciasDaAgenda {
  uow: UnidadeDeTrabalho
  leituras: LeiturasDaAgenda
  relogio: Relogio
  gerarId?: () => string
}

/** O paciente da consulta: um que já existe, ou o nome e o telefone (acha pelo telefone, ou cadastra). */
export type ReferenciaDoPaciente = { id: string } | (DadosDoPaciente & { telefone: string })

export interface PedidoDeAgendamento {
  unidadeId: string
  profissionalId: string
  procedimentoId: string
  inicio: Date
  duracaoMinutos?: number
  cadeiraId?: string
  observacoes?: string | null
  paciente: ReferenciaDoPaciente
}

export interface PedidoDeRemarcacao {
  inicio: Date
  duracaoMinutos?: number
  profissionalId?: string
  cadeiraId?: string
  versao?: number
}

/** A consulta pelo telefone do paciente, como o agente pede; o nome desempata a família. */
export interface ConsultaDoTelefone {
  telefone: string
  nome?: string | null
  /** Vazio: a próxima consulta marcada do paciente. */
  consultaId?: string
}

export interface PedidoDeHorarios {
  unidadeId: string
  procedimentoId: string
  /** AAAA-MM-DD, no fuso da clínica. */
  data: string
  profissionalId?: string
  pacienteId?: string
  duracaoMinutos?: number
}

export interface ProfissionalComHorarios {
  profissional: { id: string; nome: string }
  horarios: HorarioLivre[]
}

const MINUTO = 60_000
const MAXIMO_DE_DIAS_NA_AGENDA = 42

export function casosDaAgenda({ uow, leituras, relogio, gerarId = () => crypto.randomUUID() }: DependenciasDaAgenda) {
  // ── Peças ──────────────────────────────────────────────────────────────────

  async function clinicaDe(r: Repositorios, acesso: Acesso): Promise<ClinicaDaAgenda> {
    const clinica = await r.clinicas.obter(acesso.clinicaId)
    if (!clinica) throw new ErroDeDominio('nao_encontrado', 'CLINICA_NAO_ENCONTRADA', 'Clínica não encontrada')
    return clinica
  }

  async function unidadeAtiva(r: Repositorios, acesso: Acesso, unidadeId: string): Promise<Unidade> {
    const unidade = await r.estrutura.unidade(acesso.clinicaId, unidadeId)
    if (!unidade || !veUnidade(acesso, unidade.id)) throw new ErroDeDominio('nao_encontrado', 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada')
    if (!unidade.ativa) throw new ErroDeDominio('invalido', 'UNIDADE_INATIVA', `A unidade ${unidade.nome} está desativada`)
    return unidade
  }

  async function procedimentoAtivo(r: Repositorios, acesso: Acesso, procedimentoId: string): Promise<Procedimento> {
    const procedimento = await r.estrutura.procedimento(acesso.clinicaId, procedimentoId)
    if (!procedimento) throw new ErroDeDominio('nao_encontrado', 'PROCEDIMENTO_NAO_ENCONTRADO', 'Procedimento não encontrado')
    if (!procedimento.ativo) throw new ErroDeDominio('invalido', 'PROCEDIMENTO_INATIVO', `O procedimento ${procedimento.nome} está desativado`)
    return procedimento
  }

  /** Os profissionais ativos da unidade que fazem o procedimento. */
  function quemFaz(profissionais: ProfissionalDaUnidade[], procedimento: Procedimento) {
    return profissionais.filter((p) => p.ativo && (!procedimento.especialidadeId || p.especialidadeIds.includes(procedimento.especialidadeId)))
  }

  async function profissionalQueFaz(r: Repositorios, acesso: Acesso, unidade: Unidade, procedimento: Procedimento, profissionalId: string) {
    const profissional = (await r.estrutura.profissionaisDaUnidade(acesso.clinicaId, unidade.id)).find((p) => p.id === profissionalId)
    if (!profissional || !profissional.ativo) {
      throw new ErroDeDominio('nao_encontrado', 'PROFISSIONAL_NAO_ATENDE', `O profissional não atende na unidade ${unidade.nome}`)
    }
    if (procedimento.especialidadeId && !profissional.especialidadeIds.includes(procedimento.especialidadeId)) {
      throw new ErroDeDominio('invalido', 'PROFISSIONAL_SEM_ESPECIALIDADE', `${profissional.nome} não faz ${procedimento.nome}`)
    }
    return profissional
  }

  function duracaoDe(pedida: number | undefined, procedimento: Procedimento): number {
    const duracao = pedida ?? procedimento.duracaoMinutos
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 480) {
      throw new ErroDeDominio('invalido', 'DURACAO_INVALIDA', 'A duração vai de 5 minutos a 8 horas')
    }
    return duracao
  }

  function janelaDoDia(data: string, fuso: string): Janela {
    if (!lerData(data)) throw new ErroDeDominio('invalido', 'DATA_INVALIDA', `Data inválida: "${data}"`)
    return { inicio: instanteNoFuso(data, '00:00', fuso), fim: instanteNoFuso(diaSeguinte(data), '00:00', fuso) }
  }

  function quemMuda(acesso: Acesso): QuemMuda {
    if (acesso.tipo !== 'usuario') return { tipo: acesso.tipo }
    return { tipo: 'usuario', cuidaDaAgenda: cuidaDaAgenda(acesso), dentista: acesso.papeis.dentista, profissionalId: acesso.profissionalId }
  }

  /** A consulta que o acesso enxerga; a de outra unidade, ou de outro dentista, é tratada como inexistente. */
  async function consultaVisivel(r: Repositorios, acesso: Acesso, consultaId: string, versao?: number): Promise<Consulta> {
    const consulta = await r.consultas.obter(acesso.clinicaId, consultaId, { travar: true })
    const doDentista = profissionalVisivel(acesso)
    if (!consulta || !veUnidade(acesso, consulta.unidadeId) || (doDentista !== undefined && doDentista !== consulta.profissionalId)) {
      throw new ErroDeDominio('nao_encontrado', 'CONSULTA_NAO_ENCONTRADA', 'Consulta não encontrada')
    }
    if (versao !== undefined && versao !== consulta.versao) {
      throw new ErroDeDominio('conflito', 'CONSULTA_ALTERADA', 'A consulta mudou desde que foi lida: carregue de novo e confira')
    }
    return consulta
  }

  /** As cadeiras ativas da unidade, cada uma com o que a ocupa na janela. */
  async function cadeirasComOcupacoes(r: Repositorios, acesso: Acesso, unidadeId: string, janela: Janela, excetoConsultaId?: string) {
    const cadeiras = await r.estrutura.cadeirasAtivas(acesso.clinicaId, unidadeId)
    const ocupacoes = await r.ocupacoes.dasCadeiras(acesso.clinicaId, cadeiras.map((c) => c.id), janela, excetoConsultaId)
    return cadeiras.map((c) => ({ id: c.id, ocupacoes: ocupacoes.get(c.id) ?? [] }))
  }

  /** O que cabe enfileirar para o CRM e a plataforma, com o que a clínica configurou. */
  function avisosConfigurados(
    avisos: Aviso[],
    clinica: ClinicaDaAgenda,
    consulta: Consulta,
    paciente: Paciente,
    contexto: { unidade: Unidade; profissionalNome: string; procedimentoNome: string }
  ): NovoAviso[] {
    if (!paciente.telefone) return []
    const base = {
      clinicaId: clinica.id,
      consultaId: consulta.id,
      pacienteId: paciente.id,
    }
    const dados = {
      telefone: paciente.telefone,
      nome: paciente.nome,
      inicio: consulta.inicio.toISOString(),
      fim: consulta.fim.toISOString(),
      profissional: contexto.profissionalNome,
      procedimento: contexto.procedimentoNome,
      unidadeCrmId: contexto.unidade.crmUnidadeId,
    }
    const enfileirar: NovoAviso[] = []
    for (const aviso of avisos) {
      if (aviso.destino === 'crm') {
        if (clinica.ligadaAoCrm) enfileirar.push({ ...base, destino: 'crm', tipo: aviso.tipo, dados })
        continue
      }
      if (aviso.tipo === 'enviar_confirmacao' && !clinica.confirmacaoModeloId) continue
      if ((aviso.tipo === 'agendar_lembrete' || aviso.tipo === 'cancelar_lembrete') && !clinica.lembreteModeloId) continue
      if (aviso.tipo === 'etiquetar_contato') {
        const etiquetaId = aviso.etiqueta ? clinica.etiquetas[aviso.etiqueta] : null
        if (!etiquetaId) continue
        enfileirar.push({ ...base, destino: 'plataforma', tipo: aviso.tipo, dados: { ...dados, etiquetaId } })
        continue
      }
      enfileirar.push({ ...base, destino: 'plataforma', tipo: aviso.tipo, dados })
    }
    return enfileirar
  }

  async function contextoDosAvisos(r: Repositorios, acesso: Acesso, consulta: Consulta) {
    const [unidade, procedimento, profissionais] = await Promise.all([
      r.estrutura.unidade(acesso.clinicaId, consulta.unidadeId),
      r.estrutura.procedimento(acesso.clinicaId, consulta.procedimentoId),
      r.estrutura.profissionaisDaUnidade(acesso.clinicaId, consulta.unidadeId),
    ])
    return {
      unidade: unidade!,
      procedimentoNome: procedimento?.nome ?? '',
      profissionalNome: profissionais.find((p) => p.id === consulta.profissionalId)?.nome ?? '',
    }
  }

  // ── Pacientes ──────────────────────────────────────────────────────────────

  /** Cadastra o paciente, com o evento e o aviso de sincronizar o contato. */
  async function cadastrar(r: Repositorios, acesso: Acesso, clinica: ClinicaDaAgenda, dados: DadosDoPaciente, agora: Date): Promise<Paciente> {
    const telefone = dados.telefone ? normalizarTelefone(dados.telefone) : null
    const limpos = conferirDadosDoPaciente({ ...dados, telefone }, diaNoFuso(agora, clinica.fusoHorario))
    const paciente: Paciente = {
      id: gerarId(),
      clinicaId: clinica.id,
      nome: limpos.nome,
      telefone,
      email: limpos.email ?? null,
      nascimento: limpos.nascimento ?? null,
      observacoes: limpos.observacoes?.trim() || null,
      contatoPlataformaId: null,
    }
    await r.pacientes.inserir(paciente)
    await r.historico.registrar([
      { clinicaId: clinica.id, pacienteId: paciente.id, tipo: 'paciente_criado', dados: { nome: paciente.nome }, ator: atorDo(acesso), ocorridoEm: agora },
    ])
    if (telefone && clinica.sincronizarContatos) {
      await r.caixa.enfileirar([
        { clinicaId: clinica.id, pacienteId: paciente.id, destino: 'plataforma', tipo: 'sincronizar_contato', dados: { telefone, nome: paciente.nome } },
      ])
    }
    return paciente
  }

  /** O paciente da consulta: o pedido pelo id, ou o do telefone (o nome desempata a família), ou um novo. */
  async function resolverPaciente(r: Repositorios, acesso: Acesso, clinica: ClinicaDaAgenda, ref: ReferenciaDoPaciente, agora: Date) {
    if ('id' in ref) {
      const paciente = await r.pacientes.obter(clinica.id, ref.id)
      if (!paciente) throw new ErroDeDominio('nao_encontrado', 'PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado')
      return paciente
    }
    const telefone = normalizarTelefone(ref.telefone)
    const doTelefone = await r.pacientes.comTelefone(clinica.id, telefone)
    const escolha = escolherPaciente(doTelefone, ref.nome)
    if (escolha.tipo === 'um') return doTelefone.find((p) => p.id === escolha.id)!
    if (escolha.tipo === 'varios') throw pacienteAmbiguo(escolha.opcoes)
    return cadastrar(r, acesso, clinica, { ...ref, telefone }, agora)
  }

  /** Os pacientes de um telefone, para o agente: o nome desempata; nenhum é erro. */
  async function pacienteDoTelefone(r: Repositorios, clinicaId: string, telefone: string, nome?: string | null): Promise<Paciente> {
    const doTelefone = await r.pacientes.comTelefone(clinicaId, normalizarTelefone(telefone))
    const escolha = escolherPaciente(doTelefone, nome)
    if (escolha.tipo === 'varios') throw pacienteAmbiguo(escolha.opcoes)
    if (escolha.tipo === 'nenhum') throw new ErroDeDominio('nao_encontrado', 'PACIENTE_NAO_ENCONTRADO', 'Nenhum paciente com esse telefone')
    return doTelefone.find((p) => p.id === escolha.id)!
  }

  /**
   * A consulta que o agente quer mexer, travada: a pedida pelo id, se for do
   * paciente do telefone, ou a próxima marcada dele. A de outro paciente é
   * tratada como inexistente.
   */
  async function consultaMarcadaDoTelefone(r: Repositorios, acesso: Acesso, pedido: ConsultaDoTelefone): Promise<Consulta> {
    const paciente = await pacienteDoTelefone(r, acesso.clinicaId, pedido.telefone, pedido.nome)
    if (pedido.consultaId) {
      const consulta = await consultaVisivel(r, acesso, pedido.consultaId)
      if (consulta.pacienteId !== paciente.id) throw new ErroDeDominio('nao_encontrado', 'CONSULTA_NAO_ENCONTRADA', 'Consulta não encontrada')
      return consulta
    }
    const proxima = await r.consultas.proximaDosPacientes(acesso.clinicaId, [paciente.id], relogio.agora())
    if (!proxima || !veUnidade(acesso, proxima.unidadeId)) {
      throw new ErroDeDominio('nao_encontrado', 'SEM_CONSULTA_MARCADA', `${paciente.nome} não tem consulta marcada`)
    }
    return consultaVisivel(r, acesso, proxima.id)
  }

  // ── Horários ───────────────────────────────────────────────────────────────

  async function calcularHorarios(r: Repositorios, acesso: Acesso, pedido: PedidoDeHorarios) {
    const clinica = await clinicaDe(r, acesso)
    const dia = janelaDoDia(pedido.data, clinica.fusoHorario)
    const unidade = await unidadeAtiva(r, acesso, pedido.unidadeId)
    const procedimento = await procedimentoAtivo(r, acesso, pedido.procedimentoId)
    const duracao = duracaoDe(pedido.duracaoMinutos, procedimento)
    let profissionais = quemFaz(await r.estrutura.profissionaisDaUnidade(clinica.id, unidade.id), procedimento)
    if (pedido.profissionalId) {
      profissionais = profissionais.filter((p) => p.id === pedido.profissionalId)
      if (!profissionais.length) await profissionalQueFaz(r, acesso, unidade, procedimento, pedido.profissionalId)
    }
    const ids = profissionais.map((p) => p.id)
    const [expedientes, ocupacoes, cadeiras, doPaciente] = await Promise.all([
      r.estrutura.expedientes(clinica.id, unidade.id, diaDaSemana(pedido.data), ids),
      r.ocupacoes.dosProfissionais(clinica.id, ids, dia),
      cadeirasComOcupacoes(r, acesso, unidade.id, dia),
      pedido.pacienteId ? r.ocupacoes.doPaciente(clinica.id, pedido.pacienteId, dia) : Promise.resolve([]),
    ])
    const agora = relogio.agora()
    return profissionais.map((p) => ({
      profissional: p,
      consultasNoDia: (ocupacoes.get(p.id) ?? []).filter((o) => o.tipo === 'consulta').length,
      horarios: calcularHorariosLivres({
        data: pedido.data,
        fuso: clinica.fusoHorario,
        cadenciaMinutos: clinica.cadenciaMinutos,
        duracaoMinutos: duracao,
        expedientes: expedientes.filter((e) => e.profissionalId === p.id),
        ocupacoesDoProfissional: ocupacoes.get(p.id) ?? [],
        ocupacoesDoPaciente: doPaciente,
        cadeiras,
        agora,
      }),
    }))
  }

  // ── Escrita ────────────────────────────────────────────────────────────────

  async function gravarMudancaDeStatus(r: Repositorios, acesso: Acesso, consulta: Consulta, para: StatusDaConsulta, motivo?: string | null) {
    const agora = relogio.agora()
    const clinica = await clinicaDe(r, acesso)
    const mudada = mudarStatusDaConsulta(consulta, para, quemMuda(acesso), agora, motivo)
    const gravada = await r.consultas.atualizar(mudada)
    await r.historico.registrar([
      {
        clinicaId: clinica.id,
        consultaId: consulta.id,
        pacienteId: consulta.pacienteId,
        tipo: 'status_mudou',
        dados: { de: consulta.status, para, ...(mudada.motivoCancelamento ? { motivo: mudada.motivoCancelamento } : {}) },
        ator: atorDo(acesso),
        ocorridoEm: agora,
      },
    ])
    const avisos = avisosDaMudanca(consulta.status, para)
    if (avisos.length) {
      const paciente = (await r.pacientes.obter(clinica.id, consulta.pacienteId))!
      await r.caixa.enfileirar(avisosConfigurados(avisos, clinica, gravada, paciente, await contextoDosAvisos(r, acesso, gravada)))
    }
    return gravada
  }

  async function gravarRemarcacao(r: Repositorios, acesso: Acesso, consulta: Consulta, pedido: Omit<PedidoDeRemarcacao, 'versao'>) {
    const agora = relogio.agora()
    const clinica = await clinicaDe(r, acesso)
    exigirRemarcavel(consulta)
    const unidade = await unidadeAtiva(r, acesso, consulta.unidadeId)
    const procedimento = (await r.estrutura.procedimento(clinica.id, consulta.procedimentoId))!
    const profissional = await profissionalQueFaz(r, acesso, unidade, procedimento, pedido.profissionalId ?? consulta.profissionalId)
    const duracao = pedido.duracaoMinutos ?? Math.round((consulta.fim.getTime() - consulta.inicio.getTime()) / MINUTO)
    duracaoDe(duracao, procedimento)
    const janela = { inicio: pedido.inicio, fim: new Date(pedido.inicio.getTime() + duracao * MINUTO) }

    const data = diaNoFuso(janela.inicio, clinica.fusoHorario)
    const expedientes = await r.estrutura.expedientes(clinica.id, unidade.id, diaDaSemana(data), [profissional.id])
    const [ocupacoes, doPaciente, cadeiras] = await Promise.all([
      r.ocupacoes.dosProfissionais(clinica.id, [profissional.id], janela, consulta.id),
      r.ocupacoes.doPaciente(clinica.id, consulta.pacienteId, janela, consulta.id),
      cadeirasComOcupacoes(r, acesso, unidade.id, janela, consulta.id),
    ])
    const cadeiraId = conferirHorario({
      janela,
      expediente: janelasDoExpediente(data, clinica.fusoHorario, expedientes),
      podeEncaixar: !ehChave(acesso),
      agora,
      ocupacoesDoProfissional: ocupacoes.get(profissional.id) ?? [],
      ocupacoesDoPaciente: doPaciente,
      cadeiras,
      cadeiraPreferida: pedido.cadeiraId ?? consulta.cadeiraId,
      cadeiraObrigatoria: Boolean(pedido.cadeiraId),
    })

    const gravada = await r.consultas.atualizar({ ...consulta, inicio: janela.inicio, fim: janela.fim, profissionalId: profissional.id, cadeiraId, status: 'agendada' })
    await r.historico.registrar([
      {
        clinicaId: clinica.id,
        consultaId: consulta.id,
        pacienteId: consulta.pacienteId,
        tipo: 'consulta_remarcada',
        dados: {
          de: { inicio: consulta.inicio.toISOString(), fim: consulta.fim.toISOString(), profissionalId: consulta.profissionalId, cadeiraId: consulta.cadeiraId, status: consulta.status },
          para: { inicio: gravada.inicio.toISOString(), fim: gravada.fim.toISOString(), profissionalId: gravada.profissionalId, cadeiraId: gravada.cadeiraId },
        },
        ator: atorDo(acesso),
        ocorridoEm: agora,
      },
    ])
    const paciente = (await r.pacientes.obter(clinica.id, consulta.pacienteId))!
    await r.caixa.enfileirar(
      avisosConfigurados(avisosDaRemarcacao(), clinica, gravada, paciente, { unidade, profissionalNome: profissional.nome, procedimentoNome: procedimento.nome })
    )
    return gravada
  }

  return {
    /** Os horários livres de cada profissional que faz o procedimento na unidade, no dia. */
    async horariosLivres(acesso: Acesso, pedido: PedidoDeHorarios): Promise<ProfissionalComHorarios[]> {
      return uow.executar(async (r) => {
        const calculados = await calcularHorarios(r, acesso, pedido)
        return calculados.map((c) => ({ profissional: { id: c.profissional.id, nome: c.profissional.nome }, horarios: c.horarios }))
      })
    },

    /**
     * Para o agente de IA: o profissional recomendado e as alternativas, cada um com
     * os horários do dia. Só entra quem tem horário livre.
     */
    async recomendar(acesso: Acesso, pedido: Omit<PedidoDeHorarios, 'pacienteId' | 'profissionalId'> & { telefone?: string; nome?: string; quantos?: number }) {
      return uow.executar(async (r) => {
        let paciente: Paciente | null = null
        if (pedido.telefone) {
          const doTelefone = await r.pacientes.comTelefone(acesso.clinicaId, normalizarTelefone(pedido.telefone))
          const escolha = escolherPaciente(doTelefone, pedido.nome)
          if (escolha.tipo === 'um') paciente = doTelefone.find((p) => p.id === escolha.id)!
        }
        const calculados = await calcularHorarios(r, acesso, { ...pedido, pacienteId: paciente?.id })
        const atenderam = new Set(paciente ? await r.consultas.profissionaisQueAtenderam(acesso.clinicaId, [paciente.id]) : [])
        const ordem = ordenarProfissionais(
          calculados
            .filter((c) => c.horarios.length > 0)
            .map((c) => ({
              id: c.profissional.id,
              nome: c.profissional.nome,
              prioridade: c.profissional.prioridade,
              especialidadeIds: c.profissional.especialidadeIds,
              jaAtendeuOPaciente: atenderam.has(c.profissional.id),
              consultasNoDia: c.consultasNoDia,
              horarios: c.horarios,
            })),
          null
        ).slice(0, Math.max(1, pedido.quantos ?? 2))
        const comoSaida = (c: (typeof ordem)[number]) => ({ profissional: { id: c.id, nome: c.nome }, motivo: motivoDaRecomendacao(c), horarios: c.horarios })
        return {
          paciente: paciente ? { id: paciente.id, nome: paciente.nome } : null,
          recomendado: ordem[0] ? comoSaida(ordem[0]) : null,
          alternativas: ordem.slice(1).map(comoSaida),
        }
      })
    },

    async agendar(acesso: Acesso, pedido: PedidoDeAgendamento) {
      exigirQueCuidaDaAgenda(acesso)
      return uow.executar(async (r) => {
        const agora = relogio.agora()
        const clinica = await clinicaDe(r, acesso)
        const unidade = await unidadeAtiva(r, acesso, pedido.unidadeId)
        const procedimento = await procedimentoAtivo(r, acesso, pedido.procedimentoId)
        const profissional = await profissionalQueFaz(r, acesso, unidade, procedimento, pedido.profissionalId)
        const duracao = duracaoDe(pedido.duracaoMinutos, procedimento)
        const janela = { inicio: pedido.inicio, fim: new Date(pedido.inicio.getTime() + duracao * MINUTO) }
        const paciente = await resolverPaciente(r, acesso, clinica, pedido.paciente, agora)

        const data = diaNoFuso(janela.inicio, clinica.fusoHorario)
        const expedientes = await r.estrutura.expedientes(clinica.id, unidade.id, diaDaSemana(data), [profissional.id])
        const [ocupacoes, doPaciente, cadeiras] = await Promise.all([
          r.ocupacoes.dosProfissionais(clinica.id, [profissional.id], janela),
          r.ocupacoes.doPaciente(clinica.id, paciente.id, janela),
          cadeirasComOcupacoes(r, acesso, unidade.id, janela),
        ])
        const cadeiraId = conferirHorario({
          janela,
          expediente: janelasDoExpediente(data, clinica.fusoHorario, expedientes),
          podeEncaixar: !ehChave(acesso),
          agora,
          ocupacoesDoProfissional: ocupacoes.get(profissional.id) ?? [],
          ocupacoesDoPaciente: doPaciente,
          cadeiras,
          cadeiraPreferida: pedido.cadeiraId,
          cadeiraObrigatoria: Boolean(pedido.cadeiraId),
        })

        const ator = atorDo(acesso)
        const consulta: Consulta = {
          id: gerarId(),
          clinicaId: clinica.id,
          unidadeId: unidade.id,
          cadeiraId,
          profissionalId: profissional.id,
          pacienteId: paciente.id,
          procedimentoId: procedimento.id,
          inicio: janela.inicio,
          fim: janela.fim,
          status: 'agendada',
          observacoes: pedido.observacoes?.trim() || null,
          criadaPorTipo: ator.tipo,
          criadaPorId: ator.id,
          canceladaEm: null,
          motivoCancelamento: null,
          crmCardId: null,
          lembreteMensagemId: null,
          versao: 1,
        }
        await r.consultas.inserir(consulta)
        await r.historico.registrar([
          {
            clinicaId: clinica.id,
            consultaId: consulta.id,
            pacienteId: paciente.id,
            tipo: 'consulta_criada',
            dados: { inicio: consulta.inicio.toISOString(), fim: consulta.fim.toISOString(), profissionalId: profissional.id, unidadeId: unidade.id, procedimentoId: procedimento.id, cadeiraId },
            ator,
            ocorridoEm: agora,
          },
        ])
        await r.caixa.enfileirar(
          avisosConfigurados(avisosDoAgendamento(), clinica, consulta, paciente, { unidade, profissionalNome: profissional.nome, procedimentoNome: procedimento.nome })
        )
        return { consulta, paciente }
      })
    },

    /** Muda o horário (e, se pedir, o profissional ou a cadeira) da consulta marcada. Volta para "agendada". */
    async remarcar(acesso: Acesso, consultaId: string, pedido: PedidoDeRemarcacao) {
      exigirQueCuidaDaAgenda(acesso)
      return uow.executar(async (r) => gravarRemarcacao(r, acesso, await consultaVisivel(r, acesso, consultaId, pedido.versao), pedido))
    },

    /** Para o agente: remarca a consulta do paciente do telefone; sem `consultaId`, a próxima marcada. */
    async remarcarDoPaciente(acesso: Acesso, pedido: ConsultaDoTelefone & Omit<PedidoDeRemarcacao, 'versao'>) {
      exigirQueCuidaDaAgenda(acesso)
      return uow.executar(async (r) => gravarRemarcacao(r, acesso, await consultaMarcadaDoTelefone(r, acesso, pedido), pedido))
    },

    async mudarStatus(acesso: Acesso, consultaId: string, pedido: { status: StatusDaConsulta; motivo?: string | null; versao?: number }) {
      exigirEscrita(acesso)
      return uow.executar(async (r) => {
        const consulta = await consultaVisivel(r, acesso, consultaId, pedido.versao)
        return gravarMudancaDeStatus(r, acesso, consulta, pedido.status, pedido.motivo)
      })
    },

    /** Para o agente: cancela a consulta do paciente do telefone; sem `consultaId`, a próxima marcada. */
    async cancelarDoPaciente(acesso: Acesso, pedido: ConsultaDoTelefone & { motivo?: string | null }) {
      exigirEscrita(acesso)
      return uow.executar(async (r) => gravarMudancaDeStatus(r, acesso, await consultaMarcadaDoTelefone(r, acesso, pedido), 'cancelada', pedido.motivo))
    },

    /** Para o agente: o paciente respondeu ao lembrete. Sem `consultaId`, a próxima marcada. */
    async confirmarDoPaciente(acesso: Acesso, pedido: ConsultaDoTelefone) {
      exigirEscrita(acesso)
      return uow.executar(async (r) => gravarMudancaDeStatus(r, acesso, await consultaMarcadaDoTelefone(r, acesso, pedido), 'confirmada'))
    },

    /** Uma consulta, no formato da tela; a que o acesso não enxerga é tratada como inexistente. */
    async consulta(acesso: Acesso, consultaId: string): Promise<ConsultaNaAgenda> {
      const consulta = await leituras.consulta(acesso.clinicaId, consultaId)
      const doDentista = profissionalVisivel(acesso)
      if (!consulta || !veUnidade(acesso, consulta.unidade.id) || (doDentista !== undefined && doDentista !== consulta.profissional.id)) {
        throw new ErroDeDominio('nao_encontrado', 'CONSULTA_NAO_ENCONTRADA', 'Consulta não encontrada')
      }
      return consulta
    },

    /** A próxima consulta marcada do paciente, pelo id ou pelo telefone (e o nome, na família). */
    async proximaConsulta(acesso: Acesso, pedido: { pacienteId: string } | { telefone: string; nome?: string | null }): Promise<ConsultaNaAgenda | null> {
      const pacienteId =
        'pacienteId' in pedido ? pedido.pacienteId : (await uow.executar((r) => pacienteDoTelefone(r, acesso.clinicaId, pedido.telefone, pedido.nome))).id
      const agora = relogio.agora()
      const consultas = await leituras.consultasDoPaciente(acesso.clinicaId, pacienteId)
      const futuras = consultas.filter((c) => (c.status === 'agendada' || c.status === 'confirmada') && c.inicio > agora && veUnidade(acesso, c.unidade.id))
      return futuras.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0] ?? null
    },

    /** A agenda de um período: o dentista vê só a dele, e cada um vê as unidades que enxerga. */
    async agendaDoPeriodo(acesso: Acesso, filtro: { de: Date; ate: Date; unidadeId?: string; profissionalId?: string }): Promise<ConsultaNaAgenda[]> {
      const dias = (filtro.ate.getTime() - filtro.de.getTime()) / (24 * 60 * MINUTO)
      if (!(dias > 0) || dias > MAXIMO_DE_DIAS_NA_AGENDA) {
        throw new ErroDeDominio('invalido', 'PERIODO_INVALIDO', `O período vai de um instante a até ${MAXIMO_DE_DIAS_NA_AGENDA} dias`)
      }
      const doDentista = profissionalVisivel(acesso)
      if (doDentista === null) return []
      if (doDentista && filtro.profissionalId && filtro.profissionalId !== doDentista) return []
      if (filtro.unidadeId && !veUnidade(acesso, filtro.unidadeId)) return []
      return leituras.agendaDoPeriodo(acesso.clinicaId, {
        de: filtro.de,
        ate: filtro.ate,
        unidadeIds: filtro.unidadeId ? [filtro.unidadeId] : unidadesVisiveis(acesso),
        profissionalId: doDentista ?? filtro.profissionalId,
      })
    },

    // ── Pacientes ────────────────────────────────────────────────────────────

    async criarPaciente(acesso: Acesso, dados: DadosDoPaciente): Promise<Paciente> {
      exigirQueCuidaDaAgenda(acesso)
      return uow.executar(async (r) => {
        const clinica = await clinicaDe(r, acesso)
        if (dados.telefone) {
          const mesmoNome = (await r.pacientes.comTelefone(clinica.id, normalizarTelefone(dados.telefone))).find(
            (p) => normalizarNome(p.nome) === normalizarNome(dados.nome)
          )
          if (mesmoNome) throw new ErroDeDominio('conflito', 'PACIENTE_JA_EXISTE', `${mesmoNome.nome} já está cadastrado com esse telefone`)
        }
        return cadastrar(r, acesso, clinica, dados, relogio.agora())
      })
    },

    async alterarPaciente(acesso: Acesso, pacienteId: string, campos: Partial<DadosDoPaciente>): Promise<Paciente> {
      exigirQueCuidaDaAgenda(acesso)
      return uow.executar(async (r) => {
        const agora = relogio.agora()
        const clinica = await clinicaDe(r, acesso)
        const atual = await r.pacientes.obter(clinica.id, pacienteId)
        if (!atual) throw new ErroDeDominio('nao_encontrado', 'PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado')
        const telefone = campos.telefone === undefined ? undefined : campos.telefone ? normalizarTelefone(campos.telefone) : null
        const limpos = conferirDadosDoPaciente({ ...campos, ...(telefone !== undefined ? { telefone } : {}) }, diaNoFuso(agora, clinica.fusoHorario))
        const novo: Paciente = {
          ...atual,
          ...(limpos.nome !== undefined ? { nome: limpos.nome } : {}),
          ...(telefone !== undefined ? { telefone } : {}),
          ...(limpos.email !== undefined ? { email: limpos.email || null } : {}),
          ...(limpos.nascimento !== undefined ? { nascimento: limpos.nascimento || null } : {}),
          ...(limpos.observacoes !== undefined ? { observacoes: limpos.observacoes?.trim() || null } : {}),
        }
        const mudou = (['nome', 'telefone', 'email', 'nascimento', 'observacoes'] as const).filter((c) => novo[c] !== atual[c])
        if (!mudou.length) return atual
        await r.pacientes.atualizar(novo)
        await r.historico.registrar([
          {
            clinicaId: clinica.id,
            pacienteId: atual.id,
            tipo: 'paciente_alterado',
            dados: { campos: Object.fromEntries(mudou.map((c) => [c, { antes: atual[c], depois: novo[c] }])) },
            ator: atorDo(acesso),
            ocorridoEm: agora,
          },
        ])
        if (novo.telefone && clinica.sincronizarContatos && (mudou.includes('nome') || mudou.includes('telefone'))) {
          await r.caixa.enfileirar([
            { clinicaId: clinica.id, pacienteId: novo.id, destino: 'plataforma', tipo: 'sincronizar_contato', dados: { telefone: novo.telefone, nome: novo.nome } },
          ])
        }
        return novo
      })
    },

    /** Pelo nome (sem acento) ou pelos dígitos do telefone. */
    async buscarPacientes(acesso: Acesso, texto: string): Promise<PacienteEncontrado[]> {
      const busca = texto.trim()
      if (busca.length < 2) return []
      return leituras.buscarPacientes(acesso.clinicaId, busca, 20)
    },

    /**
     * A lista de pacientes da tela, por nome, uma página por vez. Com busca de 2
     * letras ou mais, só os que batem; com menos, todos.
     */
    async listarPacientes(acesso: Acesso, pedido: { busca?: string; pagina: number; porPagina: number }) {
      const busca = pedido.busca?.trim() ?? ''
      return leituras.listarPacientes(acesso.clinicaId, {
        busca: busca.length >= 2 ? busca : null,
        limite: pedido.porPagina,
        deslocamento: (pedido.pagina - 1) * pedido.porPagina,
      })
    },

    /** O Paciente 360: o cadastro, as consultas e a última visita. */
    async historicoDoPaciente(acesso: Acesso, pacienteId: string) {
      const paciente = await uow.executar((r) => r.pacientes.obter(acesso.clinicaId, pacienteId))
      if (!paciente) throw new ErroDeDominio('nao_encontrado', 'PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado')
      const consultas = (await leituras.consultasDoPaciente(acesso.clinicaId, pacienteId)).filter((c) => veUnidade(acesso, c.unidade.id))
      return { paciente, consultas, ultimaVisita: consultas.find((c) => c.status === 'concluida') ?? null }
    },
  }
}

export type CasosDaAgenda = ReturnType<typeof casosDaAgenda>
