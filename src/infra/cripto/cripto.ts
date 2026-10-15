import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Criptografia do servidor, num lugar só, copiada do CRM (ADR 0001: o esqueleto
// é copiado, não compartilhado).
//
//   · cifrar/decifrar: AES-256-GCM no formato "iv:tag:cifrado" (base64), o mesmo
//     do CRM. Guarda o segredo do webhook que a agenda cadastra no CRM. A chave
//     vem do .env (AGENDA_CHAVE_CIFRAGEM, 32 bytes em base64).
//   · hmac: HMAC-SHA256, para conferir a assinatura dos avisos do CRM.

function chaveDeCifragem(): Buffer {
  const texto = process.env.AGENDA_CHAVE_CIFRAGEM
  if (!texto) throw new Error('AGENDA_CHAVE_CIFRAGEM ausente: configure a chave de cifragem no .env')
  const chave = Buffer.from(texto, 'base64')
  if (chave.length !== 32) throw new Error('AGENDA_CHAVE_CIFRAGEM precisa ter 32 bytes em base64')
  return chave
}

export function cifrar(texto: string, chave: Buffer = chaveDeCifragem()): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [iv.toString('base64'), cifra.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':')
}

export function decifrar(guardado: string, chave: Buffer = chaveDeCifragem()): string {
  const [iv, tag, cifrado] = guardado.split(':')
  if (!iv || !tag || !cifrado) throw new Error('valor cifrado em formato inesperado')
  const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'))
  decifra.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decifra.update(Buffer.from(cifrado, 'base64')), decifra.final()]).toString('utf8')
}

export const hmac = (segredo: string | Buffer, texto: string) => createHmac('sha256', segredo).update(texto, 'utf8').digest()

/** Comparação em tempo constante: não dá pista de quantos caracteres acertaram. */
export function iguaisEmTempoConstante(a: string | Buffer, b: string | Buffer): boolean {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(a, 'utf8')
  const y = Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}
