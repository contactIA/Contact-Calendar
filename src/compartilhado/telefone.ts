import { ErroDeDominio } from './erros'

// Telefone em E.164 (+5562999990000), o formato guardado em pacientes.telefone e no CRM.
// É a chave que junta o mesmo paciente vindo de lugares diferentes: a plataforma,
// o Contact Call, o Schedule Button, a IA. Por isso todo telefone passa por aqui
// antes de chegar ao banco.
//
// Celular brasileiro sem o nono dígito (padrão antigo, que ainda aparece em
// números de WhatsApp) ganha o 9: "556299990000" e "5562999990000" são a mesma
// pessoa.

/** "(62) 99999-0000", "5562999990000", "+55 62 9999-0000" → "+5562999990000". */
export function normalizarTelefone(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '')
  if (!digitos) throw telefoneInvalido(entrada)

  // Com "+", o número já traz o país. Sem ele, 10 ou 11 dígitos são um número
  // brasileiro com DDD.
  const declarouPais = entrada.trim().startsWith('+')
  const comPais = !declarouPais && (digitos.length === 10 || digitos.length === 11) ? `55${digitos}` : digitos

  if (comPais.startsWith('55')) {
    const nacional = comPais.slice(2)
    if (nacional.length === 10) {
      const [ddd, local] = [nacional.slice(0, 2), nacional.slice(2)]
      // Fixo começa com 2 a 5; celular antigo, com 6 a 9, ganha o nono dígito.
      return /^[6-9]/.test(local) ? `+55${ddd}9${local}` : `+55${nacional}`
    }
    if (nacional.length === 11 && nacional[2] === '9') return `+55${nacional}`
    throw telefoneInvalido(entrada)
  }

  // Outro país: confia no número, dentro do limite do E.164.
  if (comPais.length < 8 || comPais.length > 15) throw telefoneInvalido(entrada)
  return `+${comPais}`
}

/** Só os dígitos, sem o "+": o formato que a API da plataforma usa na URL. */
export const digitosDoTelefone = (e164: string) => e164.replace(/\D/g, '')

function telefoneInvalido(entrada: string) {
  return new ErroDeDominio('invalido', 'TELEFONE_INVALIDO', `Telefone inválido: "${entrada}"`)
}
