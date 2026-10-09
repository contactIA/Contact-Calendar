import { ErroDeDominio } from '@/compartilhado/erros'
import type { Relogio } from '@/compartilhado/relogio'
import type { TipoDeChaveApi } from '@/compartilhado/vocabulario'
import { exigirGestor, type Acesso, type AcessoDeChave } from '../dominio/acesso'
import type { ChaveGuardada, RepositorioDeAcesso, Segredos } from './portas'

// Quem pede e as chaves da API. A chave entra pelo hash: a agenda nunca guarda o
// texto dela, e quem a cria vê o texto uma vez só. Diferente do CRM, cada chave é
// de uma clínica só (docs/modelo-de-dados.md, "chaves_api").
//
// O login da tela pelo item de menu entra aqui na fase 8.

export interface DependenciasDeAcesso {
  repositorio: RepositorioDeAcesso
  segredos: Segredos
  relogio: Relogio
  gerarId?: () => string
}

/** O que a tela mostra de uma chave: nunca o hash nem o texto. */
export type ChaveDaClinica = Omit<ChaveGuardada, 'clinicaId'>

const semClinica = ({ clinicaId: _, ...chave }: ChaveGuardada): ChaveDaClinica => chave

const chaveInvalida = () => new ErroDeDominio('nao_autenticado', 'CHAVE_INVALIDA', 'Chave da API inválida ou revogada')

export function casosDeAcesso({ repositorio, segredos, relogio, gerarId = () => crypto.randomUUID() }: DependenciasDeAcesso) {
  return {
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
