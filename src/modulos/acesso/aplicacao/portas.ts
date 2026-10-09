import type { TipoDeChaveApi } from '@/compartilhado/vocabulario'

// As fronteiras do módulo de acesso: o banco das clínicas e das chaves, e o
// segredo (gerar a chave e tirar o hash dela). Os adaptadores ficam em
// ../infraestrutura.

export interface ClinicaDeAcesso {
  id: string
  companyId: string
  ativa: boolean
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
