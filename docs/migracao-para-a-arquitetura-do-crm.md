# Migração para a arquitetura do CRM

Plano da [ADR 0001](adr/0001-app-proprio-com-a-arquitetura-do-crm.md). A agenda
quase não tem uso (em 2026-10-07: 11 contas de teste, nenhuma consulta futura,
e o login de pessoa não funciona em produção), então a migração é uma reescrita
incremental sem convivência com dados vivos.

## Fases

| Fase | O que entra | Tamanho |
|---|---|---|
| 0 | Limpeza: sai a camada do painel nativo e o código morto | feita |
| 1 | Decisão e plano (ADR 0001 e este documento) | feita |
| 2 | Esqueleto: Hono com zod e OpenAPI, Drizzle, pg-boss, vitest com PGlite, dependency-cruiser, CI no GitHub Actions, Dockerfile, `npm run verificar` | feita |
| 3 | Esquema `agenda`: o [modelo de dados](modelo-de-dados.md) aprovado, as migrações `0000` e `0001` (não aplicadas) e os testes de banco (sobreposição por profissional, cadeira e paciente, mesma clínica nas chaves) | feita |
| 4 | Domínio e casos de uso: horários livres, conflito, prioridade dos profissionais, consultas, pacientes. Os cenários do README viram testes sem banco | feita |
| 5 | API: rotas da tela e do agente com `createRoute`, documentação em `/api/docs`; os cadastros da clínica (unidades, cadeiras, especialidades, procedimentos, profissionais, expedientes, bloqueios) com os casos de uso deles | médio |
| 6 | Telas: agenda (dia, semana, lista), pacientes e configurações sobre a API nova | grande |
| 7 | Ligação com o CRM: caixa de saída, worker, webhooks de entrada, a escolha do lembrete sincronizada; no CRM, `POST /cards` aceitar a data da consulta numa chamada só e uma rota para a chave ler e gravar a escolha do lembrete | médio |
| 8 | Acesso e deploy: login pelo item de menu, o app no ar em `agenda.contactia.com.br`, item de menu na plataforma | médio |
| 9 | Corte e documentação: recriar as clínicas reais, desligar a Vercel, pausar o Supabase antigo e publicar a documentação da API no ReadMe | pequeno |

## Regras da migração

- **Horários livres saem do SQL** (`get_available_slots`) para o domínio em
  TypeScript, testável sem banco. O fuso entra por parâmetro: a remarcação já
  teve um erro de 3 horas por fuso.
- **As restrições que impedem duas consultas no mesmo horário ficam no banco**,
  como garantia final contra pedidos simultâneos. O domínio confere antes, para
  dar a frase certa. O Drizzle não descreve essas restrições: elas entram como
  SQL escrito à mão na migração.
- **A busca sem acento fica no SQL**, numa consulta dedicada.
- **O telefone segue a regra do CRM** (E.164, com o nono dígito no celular
  antigo). Hoje a busca compara só os dígitos finais: a troca é uma mudança de
  comportamento, não um porte.
- **Enquanto a migração não termina**, o código novo fica num ramo. A `master`
  publica na Vercel a cada push.

## Decidido na construção (fase 4, a confirmar com a equipe)

Regras que a agenda antiga não tinha, ou tinha diferente, e que entraram em
`src/modulos/agenda`. Cada uma tem teste; mudar qualquer uma é mudar um lugar só.

1. **A chave do agente de IA e das integrações confirma e cancela.** A antiga só
   deixava cancelar; confirmar serve ao paciente que responde ao lembrete pelo
   WhatsApp. Faltas e chegadas continuam com a recepção.
2. **A recomendação de profissional considera quem tem menos consultas no dia**,
   depois de quem já atendeu o paciente e antes da prioridade. O README antigo
   prometia isso, mas o código não fazia.
3. **A chave só marca no futuro e dentro do expediente.** A recepção pode
   encaixar fora do expediente e registrar no passado.
4. **Nada de horário livre no passado.** A antiga oferecia os horários de hoje
   que já tinham passado.
5. **Remarcar só a consulta agendada ou confirmada**, e ela volta para agendada
   (a confirmação vale para o horário antigo). A cancelada e a falta não se
   remarcam: marca-se outra, o que no CRM é o "reagendou".
6. **O CRM fica sabendo que o paciente compareceu uma vez só:** quando ele chega
   (em atendimento) ou quando a consulta é concluída direto.
7. **O dentista vê a agenda dele** e só marca chegada e atendimento das consultas
   dele; a de outro dentista é tratada como inexistente.
8. **O bloqueio tira o profissional de todas as unidades**, como na antiga; a
   unidade do bloqueio é só para mostrar.
9. **Cadastrar de novo o mesmo nome no mesmo telefone é recusado.** Outro nome no
   mesmo telefone é outra pessoa da família.
10. **Paciente sem telefone não gera aviso** ao CRM nem à plataforma: os dois
    precisam do número.

## Decidido com a equipe (2026-10-07)

1. **Quem entra.** O dentista pode ter usuário na plataforma: ele entra pelo item
   de menu como a recepção e o gestor. O profissional continua um cadastro da
   agenda, ligado ao usuário quando houver.
2. **Recomeçar vazio.** Nenhuma clínica usa a agenda em produção: o banco novo
   nasce vazio, sem migrar dados.
3. **A API segue o padrão do CRM** (`/api/v1/...`, campos em camelCase, erros
   `{ erro, codigo }`), inclusive a do agente. A documentação vai para o ReadMe,
   no mesmo projeto da do CRM, como parte final da migração (fase 9). O que falta
   para publicar está na seção "ReadMe", abaixo.
4. **O domínio é `agenda.contactia.com.br`.** Ver a seção "Domínio", abaixo.
5. **O lembrete da consulta tem dois caminhos, sincronizados.** A clínica pode
   escolher na agenda ou no CRM por onde o lembrete sai, e a escolha feita num
   aparece igual no outro. Uma consulta nunca recebe dois lembretes. Proposta: a
   escolha fica guardada num lugar só (o CRM), e a tela da agenda lê e grava pela
   API do CRM. Hoje a configuração do gestor no CRM é só da tela, então o CRM
   precisa de uma rota para a chave da integração. Aprovado.

## Domínio (conferido em 2026-10-07)

- O DNS do `contactia.com.br` fica na hospedagem do site (nameservers
  `ns1/ns2.brasil126-5173.com.br`), o mesmo lugar onde foi criado o registro do
  CRM (`crm.contactia.com.br` → `179.197.235.183`, a VPS da Hostinger).
- **`agenda.contactia.com.br` já existe:** é um CNAME para
  `manager01.contactia.com.br` (`178.156.203.95`, um servidor na Hetzner, o mesmo
  de `api.contactia.com.br`). Lá responde um Traefik, com o certificado padrão
  dele e 404, porque o app ainda não foi criado no TurboCloud. Quando o app for
  criado lá com esse domínio, o Traefik emite o certificado, e o DNS não precisa
  mudar.
- **Em aberto (fase 8):** a agenda roda no TurboCloud (`manager01`, onde o DNS já
  aponta) ou na VPS do CRM? Na VPS, o registro vira um **A** para
  `179.197.235.183` e o nginx e o certificado seguem o passo a passo do CRM. A
  ADR 0001 pressupôs a VPS; se for o TurboCloud, ela ganha uma revisão.

## ReadMe (fase 9)

A documentação da API da agenda vai para o mesmo projeto do ReadMe do CRM
(`contactiacrm.readme.io`), como uma segunda API. O código já está pronto
(`npm run docs:readme` e o passo do CI, com o identificador `agenda.json`); falta:

- [ ] Conferir se o plano do ReadMe aceita uma segunda API no mesmo projeto. Se
      não aceitar, criar um projeto só da agenda e trocar a origem do CORS em
      `src/api/app.ts`.
- [ ] Cadastrar o segredo `README_API_KEY` no repositório Contact-Calendar, como
      no do CRM. Quem cadastra é a equipe.
- [ ] Com a API no ar em `agenda.contactia.com.br`, fazer o primeiro envio pelo CI
      da `master` e conferir o "Try It" (CORS e endereço de produção).
- [ ] Ligar as duas documentações: um link da do CRM para a da agenda e o
      contrário.
