// Formatação de data/hora no fuso da clínica (America/Sao_Paulo).
//
// Os campos start_at/end_at são timestamptz (instante UTC). Fatiar a string ISO
// (slice(11,16)) devolve a hora UTC — ex.: um horário de 10h em São Paulo, salvo
// como 13:00Z, virava "13:00". Estas funções convertem para o fuso da clínica.

const CLINIC_TZ = 'America/Sao_Paulo'

/** "HH:MM" no fuso da clínica a partir de um timestamptz. */
export function spTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: CLINIC_TZ,
    hour:     '2-digit',
    minute:   '2-digit',
  })
}

/** "YYYY-MM-DD" no fuso da clínica a partir de um timestamptz. */
export function spDate(iso: string): string {
  // en-CA usa o formato ISO (YYYY-MM-DD).
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: CLINIC_TZ })
}
