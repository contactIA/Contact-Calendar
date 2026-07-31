import { supabaseAdmin } from '@/lib/supabase'
import { getContactByPhone, getHelenaTokenForAccount } from '@/lib/helena'
import { normalizePhoneE164 } from '@/lib/patient/phone'

// ============================================================================
// Vinculo Helena do paciente (TASK-050) — "casamento" por telefone.
//
// Descobre o contactId da Helena a partir do telefone do paciente e persiste
// em patients.helena_contact_id (+ phone_e164 normalizado). Ver ADRs 050-1..6.
//
// Notas de arquitetura:
//   - getContactByPhone resolve telefone -> 1 contato ou null (endpoint por
//     numero exato). Nao produz "varios" — por isso o status 'ambiguous' existe
//     no type como defesa futura, mas nenhum caminho o produz hoje (ADR-050-1).
//   - helena_lead_id NAO e resolvido aqui: a API por telefone nao devolve o
//     lead/card. Fica null; a resolucao lead<->card e da TASK-014/022 via
//     getCardByContact (ADR-050-2). Debito documentado.
//   - Nunca sobrescreve um helena_contact_id existente com null (ADR-050-5).
//   - Deps injetaveis para testabilidade (mesmo padrao do outboxWorker).
// ============================================================================

export type ResolveStatus = 'linked' | 'not_found' | 'ambiguous' | 'no_phone' | 'no_token' | 'error'

export interface ResolveResult {
  status:            ResolveStatus
  helena_contact_id: string | null
  phone_e164:        string | null
}

export interface ResolveDeps {
  getToken:       (accountId: string) => Promise<string | null>
  findContact:    (token: string, phoneE164: string) => Promise<string | null>
  persist:        (accountId: string, patientId: string, patch: { helena_contact_id?: string; phone_e164: string }) => Promise<void>
}

function makeProdDeps(): ResolveDeps {
  return {
    getToken: getHelenaTokenForAccount,
    findContact: getContactByPhone,
    async persist(accountId, patientId, patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin as any)
        .from('patients')
        .update(patch)
        .eq('id', patientId)
        .eq('account_id', accountId)  // defesa: nunca cruzar contas (ADR-050-6)
      if (error) throw new Error(`Erro ao gravar vinculo Helena: ${error.message}`)
    },
  }
}

export interface ResolveInput {
  accountId:  string
  patientId:  string
  phone:      string | null   // telefone bruto do paciente (qualquer formato)
  phoneE164?: string | null   // se ja normalizado antes, reusa
}

export async function resolveHelenaLink(
  input: ResolveInput,
  deps: ResolveDeps = makeProdDeps(),
): Promise<ResolveResult> {
  // 1. Normaliza para E.164 (reusa se ja veio pronto). Fonte unica: phone.ts.
  const e164 = input.phoneE164 ?? normalizePhoneE164(input.phone)
  if (!e164) return { status: 'no_phone', helena_contact_id: null, phone_e164: null }

  // 2. Token da conta — nunca do cliente.
  const token = await deps.getToken(input.accountId)
  if (!token) return { status: 'no_token', helena_contact_id: null, phone_e164: e164 }

  // 3. Busca o contato na Helena por telefone exato.
  let contactId: string | null
  try {
    contactId = await deps.findContact(token, e164)
  } catch {
    // Falha de rede/API — persiste ao menos o e164 normalizado, sem vinculo.
    await deps.persist(input.accountId, input.patientId, { phone_e164: e164 })
    return { status: 'error', helena_contact_id: null, phone_e164: e164 }
  }

  // 4. Persiste. Se achou contato, grava o vinculo; se nao, so o e164
  //    (NUNCA sobrescreve helena_contact_id existente com null — ADR-050-5).
  if (contactId) {
    await deps.persist(input.accountId, input.patientId, { helena_contact_id: contactId, phone_e164: e164 })
    return { status: 'linked', helena_contact_id: contactId, phone_e164: e164 }
  }
  await deps.persist(input.accountId, input.patientId, { phone_e164: e164 })
  return { status: 'not_found', helena_contact_id: null, phone_e164: e164 }
}
