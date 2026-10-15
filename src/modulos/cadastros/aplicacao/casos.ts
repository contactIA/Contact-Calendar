import { ErroDeDominio } from '@/compartilhado/erros'
import {
  exigirGestor,
  exigirQueCuidaDaAgenda,
  profissionalVisivel,
  unidadesVisiveis,
  type Acesso,
} from '@/modulos/acesso/aplicacao/acesso'
import {
  conferirBloqueio,
  conferirExpedientes,
  corValida,
  duracaoValida,
  nomeLimpo,
  prioridadeValida,
  textoOpcional,
  type IntervaloDeTrabalho,
} from '../dominio/cadastros'
import type {
  Bloqueio,
  Cadeira,
  CadastrosNoBanco,
  Especialidade,
  Procedimento,
  Profissional,
  RepositorioDeCadastros,
  Unidade,
  UnidadeDoProfissional,
} from './portas'

// Os cadastros da clínica: unidades, cadeiras, especialidades, procedimentos,
// profissionais (com as especialidades, as unidades e a prioridade em cada uma),
// expedientes e bloqueios. Quem cadastra é o gestor; os bloqueios, também a
// recepção. Todo acesso lê: a tela e o agente precisam das listas para agendar.
//
// Nada daqui se apaga, se desativa: a consulta antiga continua apontando para a
// cadeira e o procedimento dela. As exceções são a especialidade sem uso e o
// bloqueio.

export interface DependenciasDosCadastros {
  banco: CadastrosNoBanco
  gerarId?: () => string
}

export interface DadosDaUnidade {
  nome: string
  endereco?: string | null
  telefone?: string | null
  crmUnidadeId?: string | null
}

export interface DadosDoProcedimento {
  nome: string
  duracaoMinutos: number
  cor?: string
  especialidadeId?: string | null
}

export interface DadosDoProfissional {
  nome: string
  cro?: string | null
  cor?: string
  usuarioId?: string | null
  idNoProntuario?: string | null
  especialidadeIds?: string[]
  unidades?: UnidadeDoProfissional[]
}

export interface PedidoDeBloqueio {
  profissionalId: string
  unidadeId?: string | null
  inicio: Date
  fim: Date
  tipo: string
  motivo?: string | null
}

const COR_DO_PROCEDIMENTO = '#10B981'
const COR_DO_PROFISSIONAL = '#3B82F6'
const MAXIMO_DE_DIAS_NA_LISTA_DE_BLOQUEIOS = 366

const naoEncontrado = (codigo: string, frase: string) => new ErroDeDominio('nao_encontrado', codigo, frase)

/** Aplica só os campos que vieram: `undefined` mantém o que estava. */
function mesclar<T extends object>(atual: T, mudancas: Partial<T>): T {
  return { ...atual, ...Object.fromEntries(Object.entries(mudancas).filter(([, v]) => v !== undefined)) }
}

export function casosDosCadastros({ banco, gerarId = () => crypto.randomUUID() }: DependenciasDosCadastros) {
  // ── Peças ──────────────────────────────────────────────────────────────────

  async function unidadeDa(r: RepositorioDeCadastros, clinicaId: string, id: string) {
    const unidade = await r.unidades.obter(clinicaId, id)
    if (!unidade) throw naoEncontrado('UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada')
    return unidade
  }

  async function profissionalDa(r: RepositorioDeCadastros, clinicaId: string, id: string) {
    const profissional = await r.profissionais.obter(clinicaId, id)
    if (!profissional) throw naoEncontrado('PROFISSIONAL_NAO_ENCONTRADO', 'Profissional não encontrado')
    return profissional
  }

  async function especialidadeExiste(r: RepositorioDeCadastros, clinicaId: string, id: string | null | undefined) {
    if (id && !(await r.especialidades.obter(clinicaId, id))) throw naoEncontrado('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada')
  }

  /** As especialidades e as unidades do profissional: todas da clínica, sem repetir. */
  async function conferirVinculos(r: RepositorioDeCadastros, clinicaId: string, especialidadeIds: string[], unidades: UnidadeDoProfissional[]) {
    const especialidades = [...new Set(especialidadeIds)]
    for (const id of especialidades) await especialidadeExiste(r, clinicaId, id)
    if (new Set(unidades.map((u) => u.unidadeId)).size !== unidades.length) {
      throw new ErroDeDominio('invalido', 'UNIDADE_REPETIDA', 'A mesma unidade aparece duas vezes')
    }
    for (const u of unidades) {
      await unidadeDa(r, clinicaId, u.unidadeId)
      prioridadeValida(u.prioridade)
    }
    return { especialidadeIds: especialidades, unidades }
  }

  async function usuarioLivre(r: RepositorioDeCadastros, clinicaId: string, usuarioId: string | null | undefined) {
    if (usuarioId && !(await r.profissionais.usuarioExiste(clinicaId, usuarioId))) {
      throw naoEncontrado('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado nesta clínica')
    }
  }

  return {
    // ── Unidades ─────────────────────────────────────────────────────────────

    /** As unidades que o acesso enxerga, as desativadas inclusive. */
    async unidades(acesso: Acesso): Promise<Unidade[]> {
      const visiveis = unidadesVisiveis(acesso)
      const todas = await banco.executar((r) => r.unidades.listar(acesso.clinicaId))
      return visiveis ? todas.filter((u) => visiveis.includes(u.id)) : todas
    },

    async criarUnidade(acesso: Acesso, dados: DadosDaUnidade): Promise<Unidade> {
      exigirGestor(acesso)
      const unidade: Unidade = {
        id: gerarId(),
        nome: nomeLimpo(dados.nome, 'da unidade'),
        endereco: textoOpcional(dados.endereco),
        telefone: textoOpcional(dados.telefone),
        ativa: true,
        crmUnidadeId: dados.crmUnidadeId ?? null,
      }
      await banco.executar((r) => r.unidades.inserir(acesso.clinicaId, unidade))
      return unidade
    },

    async alterarUnidade(acesso: Acesso, id: string, campos: Partial<DadosDaUnidade> & { ativa?: boolean }): Promise<Unidade> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        const atual = await unidadeDa(r, acesso.clinicaId, id)
        const nova = mesclar(atual, {
          nome: campos.nome === undefined ? undefined : nomeLimpo(campos.nome, 'da unidade'),
          endereco: campos.endereco === undefined ? undefined : textoOpcional(campos.endereco),
          telefone: campos.telefone === undefined ? undefined : textoOpcional(campos.telefone),
          crmUnidadeId: campos.crmUnidadeId,
          ativa: campos.ativa,
        })
        if (atual.ativa && !nova.ativa) {
          const ativas = (await r.unidades.listar(acesso.clinicaId)).filter((u) => u.ativa)
          if (ativas.length === 1) throw new ErroDeDominio('invalido', 'ULTIMA_UNIDADE', 'A clínica precisa de pelo menos uma unidade ativa')
        }
        await r.unidades.atualizar(acesso.clinicaId, nova)
        return nova
      })
    },

    // ── Cadeiras ─────────────────────────────────────────────────────────────

    async cadeiras(acesso: Acesso, unidadeId?: string): Promise<Cadeira[]> {
      const visiveis = unidadesVisiveis(acesso)
      const todas = await banco.executar((r) => r.cadeiras.listar(acesso.clinicaId, unidadeId))
      return visiveis ? todas.filter((c) => visiveis.includes(c.unidadeId)) : todas
    },

    async criarCadeira(acesso: Acesso, dados: { unidadeId: string; nome: string }): Promise<Cadeira> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        await unidadeDa(r, acesso.clinicaId, dados.unidadeId)
        const cadeira: Cadeira = { id: gerarId(), unidadeId: dados.unidadeId, nome: nomeLimpo(dados.nome, 'da cadeira'), ativa: true }
        await r.cadeiras.inserir(acesso.clinicaId, cadeira)
        return cadeira
      })
    },

    async alterarCadeira(acesso: Acesso, id: string, campos: { nome?: string; ativa?: boolean }): Promise<Cadeira> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        const atual = await r.cadeiras.obter(acesso.clinicaId, id)
        if (!atual) throw naoEncontrado('CADEIRA_NAO_ENCONTRADA', 'Cadeira não encontrada')
        const nova = mesclar(atual, { nome: campos.nome === undefined ? undefined : nomeLimpo(campos.nome, 'da cadeira'), ativa: campos.ativa })
        await r.cadeiras.atualizar(acesso.clinicaId, nova)
        return nova
      })
    },

    // ── Especialidades ───────────────────────────────────────────────────────

    async especialidades(acesso: Acesso): Promise<Especialidade[]> {
      return banco.executar((r) => r.especialidades.listar(acesso.clinicaId))
    },

    async criarEspecialidade(acesso: Acesso, dados: { nome: string }): Promise<Especialidade> {
      exigirGestor(acesso)
      const especialidade = { id: gerarId(), nome: nomeLimpo(dados.nome, 'da especialidade') }
      await banco.executar((r) => r.especialidades.inserir(acesso.clinicaId, especialidade))
      return especialidade
    },

    async renomearEspecialidade(acesso: Acesso, id: string, dados: { nome: string }): Promise<Especialidade> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        if (!(await r.especialidades.obter(acesso.clinicaId, id))) throw naoEncontrado('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada')
        const especialidade = { id, nome: nomeLimpo(dados.nome, 'da especialidade') }
        await r.especialidades.atualizar(acesso.clinicaId, especialidade)
        return especialidade
      })
    },

    /** Só a que nenhum procedimento nem profissional usa. */
    async apagarEspecialidade(acesso: Acesso, id: string): Promise<void> {
      exigirGestor(acesso)
      await banco.executar(async (r) => {
        const especialidade = await r.especialidades.obter(acesso.clinicaId, id)
        if (!especialidade) throw naoEncontrado('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada')
        if ((await r.especialidades.usos(acesso.clinicaId, id)) > 0) {
          throw new ErroDeDominio('conflito', 'ESPECIALIDADE_EM_USO', `${especialidade.nome} está em uso: tire-a dos procedimentos e dos profissionais antes`)
        }
        await r.especialidades.apagar(acesso.clinicaId, id)
      })
    },

    // ── Procedimentos ────────────────────────────────────────────────────────

    async procedimentos(acesso: Acesso): Promise<Procedimento[]> {
      return banco.executar((r) => r.procedimentos.listar(acesso.clinicaId))
    },

    async criarProcedimento(acesso: Acesso, dados: DadosDoProcedimento): Promise<Procedimento> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        await especialidadeExiste(r, acesso.clinicaId, dados.especialidadeId)
        const procedimento: Procedimento = {
          id: gerarId(),
          nome: nomeLimpo(dados.nome, 'do procedimento'),
          duracaoMinutos: duracaoValida(dados.duracaoMinutos),
          cor: corValida(dados.cor ?? COR_DO_PROCEDIMENTO),
          especialidadeId: dados.especialidadeId ?? null,
          ativo: true,
        }
        await r.procedimentos.inserir(acesso.clinicaId, procedimento)
        return procedimento
      })
    },

    async alterarProcedimento(acesso: Acesso, id: string, campos: Partial<DadosDoProcedimento> & { ativo?: boolean }): Promise<Procedimento> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        const atual = await r.procedimentos.obter(acesso.clinicaId, id)
        if (!atual) throw naoEncontrado('PROCEDIMENTO_NAO_ENCONTRADO', 'Procedimento não encontrado')
        await especialidadeExiste(r, acesso.clinicaId, campos.especialidadeId)
        const novo = mesclar(atual, {
          nome: campos.nome === undefined ? undefined : nomeLimpo(campos.nome, 'do procedimento'),
          duracaoMinutos: campos.duracaoMinutos === undefined ? undefined : duracaoValida(campos.duracaoMinutos),
          cor: campos.cor === undefined ? undefined : corValida(campos.cor),
          especialidadeId: campos.especialidadeId,
          ativo: campos.ativo,
        })
        await r.procedimentos.atualizar(acesso.clinicaId, novo)
        return novo
      })
    },

    // ── Profissionais ────────────────────────────────────────────────────────

    async profissionais(acesso: Acesso): Promise<Profissional[]> {
      return banco.executar((r) => r.profissionais.listar(acesso.clinicaId))
    },

    async criarProfissional(acesso: Acesso, dados: DadosDoProfissional): Promise<Profissional> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        await usuarioLivre(r, acesso.clinicaId, dados.usuarioId)
        const vinculos = await conferirVinculos(r, acesso.clinicaId, dados.especialidadeIds ?? [], dados.unidades ?? [])
        const profissional: Profissional = {
          id: gerarId(),
          nome: nomeLimpo(dados.nome, 'do profissional'),
          cro: textoOpcional(dados.cro),
          cor: corValida(dados.cor ?? COR_DO_PROFISSIONAL),
          usuarioId: dados.usuarioId ?? null,
          idNoProntuario: textoOpcional(dados.idNoProntuario),
          ativo: true,
          ...vinculos,
        }
        await r.profissionais.inserir(acesso.clinicaId, profissional)
        return profissional
      })
    },

    /**
     * Muda o cadastro, as especialidades ou as unidades. As listas que vierem
     * substituem as de antes; tirar uma unidade apaga os expedientes dele lá.
     */
    async alterarProfissional(acesso: Acesso, id: string, campos: Partial<DadosDoProfissional> & { ativo?: boolean }): Promise<Profissional> {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        const atual = await profissionalDa(r, acesso.clinicaId, id)
        if (campos.usuarioId !== undefined && campos.usuarioId !== atual.usuarioId) await usuarioLivre(r, acesso.clinicaId, campos.usuarioId)
        const vinculos = await conferirVinculos(r, acesso.clinicaId, campos.especialidadeIds ?? atual.especialidadeIds, campos.unidades ?? atual.unidades)
        const novo = mesclar(atual, {
          nome: campos.nome === undefined ? undefined : nomeLimpo(campos.nome, 'do profissional'),
          cro: campos.cro === undefined ? undefined : textoOpcional(campos.cro),
          cor: campos.cor === undefined ? undefined : corValida(campos.cor),
          usuarioId: campos.usuarioId,
          idNoProntuario: campos.idNoProntuario === undefined ? undefined : textoOpcional(campos.idNoProntuario),
          ativo: campos.ativo,
          ...vinculos,
        })
        await r.profissionais.atualizar(acesso.clinicaId, novo)
        return novo
      })
    },

    /**
     * O procedimento da consulta que o CRM marca fora da agenda (fase 7b): sem ele,
     * nenhuma vinda entra sozinha. Só o gestor; o procedimento é da clínica e ativo.
     */
    async definirProcedimentoDasVindas(acesso: Acesso, procedimentoId: string | null): Promise<void> {
      exigirGestor(acesso)
      await banco.executar(async (r) => {
        if (procedimentoId) {
          const procedimento = await r.procedimentos.obter(acesso.clinicaId, procedimentoId)
          if (!procedimento?.ativo) throw new ErroDeDominio('nao_encontrado', 'PROCEDIMENTO_NAO_ENCONTRADO', 'Procedimento não encontrado')
        }
        await r.clinica.definirProcedimentoDasVindas(acesso.clinicaId, procedimentoId)
      })
    },

    // ── Expedientes ──────────────────────────────────────────────────────────

    async expedientes(acesso: Acesso, profissionalId: string) {
      return banco.executar(async (r) => {
        await profissionalDa(r, acesso.clinicaId, profissionalId)
        return r.expedientes.doProfissional(acesso.clinicaId, profissionalId)
      })
    },

    /** Troca a semana inteira do profissional: a tela manda todos os intervalos de uma vez. */
    async definirExpedientes(acesso: Acesso, profissionalId: string, intervalos: IntervaloDeTrabalho[]) {
      exigirGestor(acesso)
      return banco.executar(async (r) => {
        const profissional = await profissionalDa(r, acesso.clinicaId, profissionalId)
        const conferidos = conferirExpedientes(
          intervalos,
          profissional.unidades.map((u) => u.unidadeId)
        ).map((i) => ({ ...i, id: gerarId() }))
        await r.expedientes.substituir(acesso.clinicaId, profissionalId, conferidos)
        return conferidos
      })
    },

    // ── Bloqueios ────────────────────────────────────────────────────────────

    /** Os bloqueios que cruzam o período. O dentista vê os dele. */
    async bloqueios(acesso: Acesso, filtro: { de: Date; ate: Date; profissionalId?: string }): Promise<Bloqueio[]> {
      const dias = (filtro.ate.getTime() - filtro.de.getTime()) / 86_400_000
      if (!(dias > 0) || dias > MAXIMO_DE_DIAS_NA_LISTA_DE_BLOQUEIOS) {
        throw new ErroDeDominio('invalido', 'PERIODO_INVALIDO', `O período vai de um instante a até ${MAXIMO_DE_DIAS_NA_LISTA_DE_BLOQUEIOS} dias`)
      }
      const doDentista = profissionalVisivel(acesso)
      if (doDentista === null || (doDentista && filtro.profissionalId && filtro.profissionalId !== doDentista)) return []
      return banco.executar((r) => r.bloqueios.listar(acesso.clinicaId, { ...filtro, profissionalId: doDentista ?? filtro.profissionalId }))
    },

    /**
     * Tira o profissional da agenda no período, em todas as unidades. As consultas
     * que já estão nele continuam: a recepção remarca.
     */
    async criarBloqueio(acesso: Acesso, pedido: PedidoDeBloqueio): Promise<Bloqueio> {
      exigirQueCuidaDaAgenda(acesso)
      return banco.executar(async (r) => {
        await profissionalDa(r, acesso.clinicaId, pedido.profissionalId)
        if (pedido.unidadeId) await unidadeDa(r, acesso.clinicaId, pedido.unidadeId)
        const bloqueio: Bloqueio = {
          id: gerarId(),
          profissionalId: pedido.profissionalId,
          unidadeId: pedido.unidadeId ?? null,
          ...conferirBloqueio(pedido),
          motivo: textoOpcional(pedido.motivo),
          criadoPorId: acesso.tipo === 'usuario' ? acesso.usuarioId : null,
        }
        await r.bloqueios.inserir(acesso.clinicaId, bloqueio)
        return bloqueio
      })
    },

    async apagarBloqueio(acesso: Acesso, id: string): Promise<void> {
      exigirQueCuidaDaAgenda(acesso)
      await banco.executar(async (r) => {
        if (!(await r.bloqueios.obter(acesso.clinicaId, id))) throw naoEncontrado('BLOQUEIO_NAO_ENCONTRADO', 'Bloqueio não encontrado')
        await r.bloqueios.apagar(acesso.clinicaId, id)
      })
    },
  }
}

export type CasosDosCadastros = ReturnType<typeof casosDosCadastros>
