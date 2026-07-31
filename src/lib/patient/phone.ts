// ============================================================================
// Normalizacao de telefone para E.164 (TASK-050).
//
// FONTE ÚNICA DE VERDADE: espelha EXATAMENTE a regra do backfill em SQL na
// migration 20260701173219_alter_patients_appointments.sql. Se a regra mudar
// aqui, mude LÁ tambem (e vice-versa) — divergencia faz o runtime procurar um
// telefone diferente do que o backfill gravou, quebrando o match na Helena.
//
// Regra (identica ao SQL):
//   - so digitos (remove tudo que nao for [0-9])
//   - vazio                                  -> null
//   - 12 ou 13 digitos começando com "55"    -> "+" + digitos      (ja tem DDI)
//   - 10 ou 11 digitos                        -> "+55" + digitos     (DDD+numero)
//   - qualquer outro tamanho                  -> "+" + digitos       (fallback)
// ============================================================================

export function normalizePhoneE164(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d === '') return null
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d
  if (d.length === 10 || d.length === 11) return '+55' + d
  return '+' + d
}
