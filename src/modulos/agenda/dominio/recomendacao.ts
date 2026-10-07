// Que profissional recomendar para o paciente (o agente de IA oferece este
// primeiro, e o paciente pode escolher outro). É uma recomendação, não uma
// atribuição.
//
// A especialidade que o procedimento exige é filtro: quem não tem fica de fora.
// Depois, em cascata:
//   1. quem já atendeu o paciente;
//   2. quem tem menos consultas no dia (o README antigo prometia, mas o código não
//      fazia; decidido na construção);
//   3. a prioridade do profissional na unidade, configurada pela clínica (menor vem
//      primeiro);
//   4. o nome, para a ordem nunca empatar.

export interface CandidatoARecomendacao {
  id: string
  nome: string
  prioridade: number
  especialidadeIds: readonly string[]
  jaAtendeuOPaciente: boolean
  consultasNoDia: number
}

export function ordenarProfissionais<T extends CandidatoARecomendacao>(candidatos: readonly T[], especialidadeExigida: string | null): T[] {
  return candidatos
    .filter((c) => !especialidadeExigida || c.especialidadeIds.includes(especialidadeExigida))
    .sort(
      (a, b) =>
        Number(b.jaAtendeuOPaciente) - Number(a.jaAtendeuOPaciente) ||
        a.consultasNoDia - b.consultasNoDia ||
        a.prioridade - b.prioridade ||
        a.nome.localeCompare(b.nome, 'pt-BR')
    )
}

export function motivoDaRecomendacao(c: CandidatoARecomendacao): string {
  return c.jaAtendeuOPaciente ? 'Já atendeu o paciente' : 'Mais disponível e com prioridade na unidade'
}
