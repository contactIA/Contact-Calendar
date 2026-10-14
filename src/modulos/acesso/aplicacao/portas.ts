import type { TipoDeChaveApi } from '@/compartilhado/vocabulario'
import type { Papeis } from '../dominio/acesso'

// As fronteiras do módulo de acesso: o banco das clínicas, dos usuários e das
// chaves; o segredo (gerar a chave e tirar o hash dela); e o token da sessão da
// tela, com o limite de tentativas. Os adaptadores ficam em ../infraestrutura.

export interface ClinicaDeAcesso {
  id: string
  companyId: string
  ativa: boolean
}

/** A clínica como a tela precisa: o nome no topo, e o fuso e a cadência da grade. */
export interface ClinicaDaSessao extends ClinicaDeAcesso {
  nome: string
  fusoHorario: string
  cadenciaMinutos: number
}

/** O usuário da agenda, com o que a sessão precisa saber dele. */
export interface UsuarioDeAcesso {
  id: string
  nome: string
  ativo: boolean
  papeis: Papeis
  /** O profissional ligado a ele, quando é dentista. */
  profissionalId: string | null
  /** As unidades vinculadas; vazia é todas. */
  unidades: string[]
}

export interface ChaveGuardada {
  id: string
  clinicaId: string
  nome: string
  tipo: TipoDeChaveApi
  prefixo: string
  podeEscrever: boolean
  criadoEm: Date
  ultimoUsoEm: Date | null
  revogadaEm: Date | null
}

export interface RepositorioDeAcesso {
  /** Pelo id da clínica ou pelo companyId da conta na plataforma. */
  clinica(idOuCompanyId: string): Promise<ClinicaDeAcesso | null>
  clinicaDaSessao(id: string): Promise<ClinicaDaSessao | null>
  /** Pelo {{userId}} da plataforma, na clínica. */
  usuarioDaPlataforma(clinicaId: string, usuarioPlataformaId: string): Promise<UsuarioDeAcesso | null>
  usuario(clinicaId: string, usuarioId: string): Promise<UsuarioDeAcesso | null>
  chavePorHash(hash: string): Promise<ChaveGuardada | null>
  registrarUsoDaChave(chaveId: string, agora: Date): Promise<void>
  chavesDaClinica(clinicaId: string): Promise<ChaveGuardada[]>
  criarChave(chave: Omit<ChaveGuardada, 'ultimoUsoEm' | 'revogadaEm'> & { hash: string }): Promise<void>
  /** Devolve se havia uma chave ativa com esse id na clínica. */
  revogarChave(clinicaId: string, chaveId: string, agora: Date): Promise<boolean>
}

export interface Segredos {
  /** Uma chave nova, aleatória, já com o prefixo da agenda. */
  novaChave(): string
  hashDaChave(chave: string): string
}

/** Assina e confere o token da sessão da tela. `verificar` devolve null se a assinatura não bate. */
export interface AssinadorDeTokens {
  assinar(dados: Record<string, unknown>): string
  verificar(token: string): Record<string, unknown> | null
}

/** Quantas entradas pelo menu um mesmo IP tenta por minuto. */
export interface LimitadorDeTentativas {
  tentar(chave: string, agora: Date): boolean
}

export interface ConfiguracaoDaEntrada {
  /** Os hosts da plataforma de onde a agenda pode ser aberta (EMBED_HOSTS). */
  hostsDaPlataforma: readonly string[]
  /** Em produção, sem a lista ninguém entra: abrir a agenda fora da plataforma não é seguro. */
  exigirHostsDaPlataforma: boolean
}
