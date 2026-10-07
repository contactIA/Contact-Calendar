// Erro que uma regra de negócio lança de propósito, com uma frase para quem lê a
// tela. O domínio não conhece HTTP: diz só o TIPO do erro, e a API traduz o tipo
// para o status (src/api/erros.ts).

export type TipoDeErro =
  | 'invalido'
  | 'nao_autenticado'
  | 'proibido'
  | 'nao_encontrado'
  | 'conflito'
  | 'muitas_tentativas'
  /** Um sistema de fora (a plataforma de mensagens, o CRM) falhou ou recusou. */
  | 'externo'
  /** O servidor não está configurado para isso (falta segredo no .env). */
  | 'indisponivel'

export class ErroDeDominio extends Error {
  constructor(
    readonly tipo: TipoDeErro,
    readonly codigo: string,
    mensagem: string
  ) {
    super(mensagem)
    this.name = 'ErroDeDominio'
  }
}
