# Migração para a arquitetura do CRM

Plano da [ADR 0001](adr/0001-app-proprio-com-a-arquitetura-do-crm.md). A agenda
quase não tem uso (em 2026-10-07: 11 contas de teste, nenhuma consulta futura,
e o login de pessoa não funciona em produção), então a migração é uma reescrita
incremental sem convivência com dados vivos.

## Onde paramos (2026-10-15)

**Feito:** fases 0 a 6, a saída das rotas antigas e as partes 7a e 7b da fase 7, no ramo
`arquitetura`. O ramo **não** foi mesclado na `master`, porque a `master` publica na
Vercel com o código antigo. As migrações do esquema `agenda` não foram aplicadas em
banco de verdade. Acompanhamento: Etapa 16 do Project do CRM (#234). As fases 0 a 6
(#223 a #229) estão em "Em revisão".

**Para retomar:**

1. `npm install`, depois `npm run banco:local`. Ele sobe o PGlite na porta 5440
   com a clínica de demonstração e escreve o `.env.local`.
2. `npx next dev -p 3310` e abra o link de uma das pessoas, que o banco local
   mostra ao subir:

   | Pessoa | Papel | Entrada |
   |---|---|---|
   | Ana Paula Mendes | gestora | `http://localhost:3310/?companyId=7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d&userId=a1111111-1111-4111-8111-111111111111` |
   | Rita Alves | recepção | `...&userId=b2222222-2222-4222-8222-222222222222` |
   | Dra. Carla Nunes | dentista | `...&userId=c3333333-3333-4333-8333-333333333333` |

3. `npm run verificar` e `npm run build` antes de cada commit.

**Decidido com a equipe em 2026-10-15:**

- **As rotas antigas da tela saíram** (37 rotas, o login antigo, o cliente da
  plataforma e o que só elas usavam). Ficaram as quatro que o onboarding público
  chama: `POST /api/onboarding/account` e o `POST` de `admin/units`,
  `admin/dentists` e `admin/procedures`. Para consultar o código que saiu, o
  último commit com ele é `81c9d39`.
- **A agenda própria recebe todas as consultas, mesmo as marcadas na Clinicorp.**
  A clínica que tem prontuário continua com a agenda; o que o CRM marca na
  Clinicorp também aparece aqui. A fase 7 continua a próxima.
- **A consulta que o CRM marca fora da agenda** (a CRC na Clinicorp, o botão, a
  IA) entra sozinha quando o dentista já está ligado a um profissional da agenda
  e o horário cabe numa cadeira. Se não, vai para a lista "Vindas do CRM", onde a
  recepção escolhe o profissional e a cadeira; a agenda guarda o vínculo do
  dentista para as próximas.
- **A agenda acompanha o card:** o que muda depois no CRM (cancelou, faltou,
  compareceu, remarcou) muda a consulta ligada, quando a mudança é de uma pessoa
  ou de outra integração. Os movimentos da própria agenda são ignorados.
- **O diálogo de agendar do CRM sobre os horários desta agenda** (como já faz com
  a Clinicorp) vira uma fase própria, depois da 7. Até lá, essas consultas entram
  pela lista "Vindas do CRM".

**Decisões pendentes, com a equipe (nesta ordem):**

1. **As regras decididas na construção:** 10 da fase 4, 9 da fase 5, 11 da fase 6
   e as da fase 7 (seções abaixo).
2. **Onde a agenda roda** (#231): TurboCloud, para onde o DNS de
   `agenda.contactia.com.br` já aponta, ou a VPS do CRM.
3. **Quem cadastra os usuários da agenda.** Ainda não há rota nem tela; hoje eles
   entram no banco à mão. Também falta o superadmin, como o do CRM.
4. **O onboarding público** grava no Supabase antigo e, no fim, manda para
   `/{accountId}`, uma página que não existe mais. Ele funciona só na `master`. Na
   fase 8, ou ele é reescrito sobre a API v1 (junto com o cadastro dos usuários),
   ou sai.

**Fase 7 (#230), a ligação com o CRM, em três partes:**

- **7a. Saída para o CRM: feita.** O worker entrega os avisos da caixa de saída
  pela API v1 do CRM (`CRM_URL` e `CRM_CHAVE` no `.env`), com as regras em
  "Decidido na construção (fase 7)". Não precisou mudar o CRM: o `POST /cards`
  com a data numa chamada só ficou dispensável, porque a entrega decide o segundo
  passo pela resposta.
- **7b. Entrada pelo webhook do CRM: feita.** O encaixe automático, a lista "Vindas do
  CRM" e a agenda acompanhando o card. Também não precisa mudar o CRM: a chave lê
  a consulta da Clinicorp com o dentista (`GET /cards/{id}/consultas`), o id dela
  mesma (`GET /eu`) e cadastra o webhook da clínica (`POST /webhooks`). Desenho:
  - **Ligar ao CRM** (o gestor, nas Configurações): a agenda cadastra o webhook
    da clínica (`card.criado`, `card.movido` e `card.alterado`) e guarda o segredo cifrado
    (`AGENDA_URL` e `AGENDA_CHAVE_CIFRAGEM` no `.env`).
  - **Receber:** `POST /api/v1/crm/avisos` confere a assinatura (`X-CRM-Assinatura`)
    com o segredo da clínica, guarda o aviso em `entradas_do_crm` (o repetido é
    ignorado pelo número da entrega) e responde na hora. O worker processa.
  - **O aviso da própria agenda** (o `ator.id` é a chave dela) é ignorado.
  - **Card em Agendados com data** (movido para Agendados, data mudada, ou a
    consulta da Clinicorp registrada): sem consulta ligada ao card, nasce uma
    "vinda" e a agenda tenta o encaixe: a unidade pelo `crm_unidade_id`, o
    profissional pelo dentista da Clinicorp já ligado, o procedimento das vindas
    da clínica, a duração da Clinicorp (ou a do procedimento) e a primeira cadeira
    livre. Faltou algo, a vinda fica na lista com o motivo. Com consulta ligada e
    data diferente, ela é remarcada; se não couber, vira uma vinda de remarcação.
  - **Card em Cancelados, Faltosos ou no CRC2 (compareceu):** a consulta ligada
    fica cancelada, com falta ou concluída, e a vinda pendente é descartada.
  - **O que o CRM pediu não volta ao CRM:** a mudança entra pelos casos de uso da
    agenda com o acesso do sistema de origem `crm`, que não grava aviso ao CRM.
- **7c. Plataforma:** confirmação, lembrete, etiquetas e contato; a escolha do
  lembrete sincronizada (no CRM, o valor `agenda` e a rota da chave); a aba de
  integração das configurações e a conversa com o paciente no popover.

**Atenções:**

- **O pooler do Supabase em modo sessão é dividido com o CRM** (15 vagas no plano
  Micro). Em 2026-10-14 ele encheu e travou o deploy do CRM. Os dois agora devolvem
  a conexão parada; antes de pôr a agenda no ar, confira as vagas (ou suba o
  "Pool Size" para até 24).
- **O que a tela mostra** continua no relógio do computador. O que vai para a API é
  no fuso da clínica.

## Fases

| Fase | O que entra | Tamanho |
|---|---|---|
| 0 | Limpeza: sai a camada do painel nativo e o código morto | feita |
| 1 | Decisão e plano (ADR 0001 e este documento) | feita |
| 2 | Esqueleto: Hono com zod e OpenAPI, Drizzle, pg-boss, vitest com PGlite, dependency-cruiser, CI no GitHub Actions, Dockerfile, `npm run verificar` | feita |
| 3 | Esquema `agenda`: o [modelo de dados](modelo-de-dados.md) aprovado, as migrações `0000` e `0001` (não aplicadas) e os testes de banco (sobreposição por profissional, cadeira e paciente, mesma clínica nas chaves) | feita |
| 4 | Domínio e casos de uso: horários livres, conflito, prioridade dos profissionais, consultas, pacientes. Os cenários do README viram testes sem banco | feita |
| 5 | API: rotas da tela e do agente com `createRoute`, documentação em `/api/docs`; os cadastros da clínica (unidades, cadeiras, especialidades, procedimentos, profissionais, expedientes, bloqueios) com os casos de uso deles | feita (ver "Decidido na construção (fase 5)") |
| 6 | Telas: agenda (dia, semana, lista), pacientes e configurações sobre a API nova, com o login pelo item de menu trazido da fase 8 | feita (ver "Decidido na construção (fase 6)") |
| 7 | Ligação com o CRM: 7a, a saída (caixa de saída e worker, feita); 7b, a entrada pelos webhooks, com o encaixe automático e a lista "Vindas do CRM"; 7c, a plataforma (confirmação, lembrete com a escolha sincronizada pelo CRM, etiquetas, a aba de integração e a conversa com o paciente na consulta) | médio |
| 7.5 | No CRM, o diálogo de agendar sobre os horários desta agenda, nos moldes da Agenda na Clinicorp (ADR 0015 do CRM) | médio |
| 8 | Acesso e deploy: quem cadastra os usuários da agenda (e o superadmin, como no CRM), o app no ar em `agenda.contactia.com.br`, item de menu na plataforma | médio |
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

## Decidido na construção (fase 5, a confirmar com a equipe)

1. **A API só aceita a chave por enquanto** (`Authorization: Bearer agd_...`). O
   token da tela entra na fase 8, junto com o login pelo item de menu. Até lá, os
   cadastros e as chaves (que são do gestor) só têm teste, sem quem os chame.
2. **A chave é de uma clínica só**, e o `X-Clinica` só confere (pelo id ou pelo
   companyId). A chave fica com o hash sha256, como no CRM; a coluna
   `chave_cifrada` fica vazia até a tela de chaves precisar mostrar de novo.
3. **Os cadastros e as chaves são do gestor.** A recepção e as chaves só leem os
   cadastros, de que precisam para agendar. Os bloqueios são da recepção também, e
   das chaves que gravam.
4. **Nada dos cadastros se apaga, se desativa**, porque as consultas antigas
   apontam para eles. Exceções: a especialidade sem uso e o bloqueio. A última
   unidade ativa não se desativa.
5. **A semana do profissional é trocada inteira** (`PUT
   /profissionais/{id}/expedientes`). Tirar o profissional de uma unidade apaga os
   expedientes dele lá.
6. **O bloqueio não mexe nas consultas que já estão no período**: a recepção
   remarca.
7. **Os cadastros não entram no histórico** (`eventos` só aceita consulta e
   paciente). Se a equipe quiser saber quem mudou um cadastro, é uma tabela nova.
8. **As habilidades do agente ganharam o `confirmar`** (a regra 1 da fase 4) e
   remarcar e cancelar aceitam o `consultaId`, como as antigas. As antigas
   (`/api/agent/*` e `/api/auth/ai`) saíram: a única chave de IA nunca foi usada.
9. **As rotas antigas da tela ficam até a fase 6**, porque as telas antigas ainda
   as chamam. Saem junto com elas.

## Decidido na construção (fase 6, a confirmar com a equipe)

1. **O login pelo item de menu veio da fase 8 para cá**, porque a chave da API não
   marca chegada nem mexe nos cadastros: copiado do CRM, com o token HMAC de 12 h
   no `sessionStorage` da aba e o cabeçalho `X-Agenda-Sessao`
   (`AGENDA_SEGREDO_SESSAO` e `EMBED_HOSTS` no `.env`). A página `/` é a entrada;
   as telas ficam em `/agenda`, `/pacientes` e `/configuracoes`, sem o
   `accountId` na URL. `GET /v1/eu` dá os papéis, o fuso e a cadência. Ficam para
   a fase 8 quem cadastra os usuários e o superadmin.
2. **As telas antigas foram aproveitadas**, com o visual delas: os hooks traduzem
   a API v1 para os tipos que as telas já usavam (`src/hooks/daApi.ts`). Quando
   as telas forem reescritas no padrão do CRM, a tradução sai.
3. **A busca da agenda é pelo paciente**: acha os pacientes pelo nome ou telefone
   e traz as consultas deles. A API não tem busca solta de consultas.
4. **A Lista mostra de hoje a seis semanas** (o máximo que a API devolve de uma
   vez), com o status e o procedimento filtrados na tela.
5. **A lista de pacientes ganhou páginas**: `GET /v1/pacientes` sem `busca` (ou
   com menos de 2 letras) lista todos por nome, com `pagina`, `porPagina` e o
   `total`, e traz as observações e a data de cadastro.
6. **A cadência da grade tem rota**: `PATCH /v1/clinica`, só o gestor, com os
   valores de `CADENCIAS_DA_GRADE` (o 45 da antiga saiu).
7. **Por papel, na tela**: o dentista vê só a agenda dele, não agenda e só marca a
   chegada e o fim das consultas dele; as Configurações são só do gestor; o
   cadastro de paciente é da recepção e do gestor. A agendada também ganhou o
   check-in direto (a regra da fase 4 já deixava).
8. **Nas Configurações**: a especialidade virou cadastro (aba nova) e o
   procedimento escolhe uma da lista; o profissional marca as unidades onde
   atende, com a prioridade, e o "excluir" virou desativar; a semana de horários
   aceita vários intervalos por dia; a chave tem tipo (agente de IA ou
   integração) e permissão de gravar, e só se revoga (não há liga e desliga).
9. **Os horários das telas são do fuso da clínica** no que vai para a API (o
   agendar, o remarcar, o dia e a semana pedidos). O que a tela mostra continua
   no relógio do computador, que no Brasil é o mesmo da clínica.
10. **As rotas antigas ainda não saíram.** A regra 9 da fase 5 as tirava aqui, mas
    na fase 0 a equipe pediu para manter o Paciente 360 e as rotas sem chamador.
    Nenhuma tela as chama mais. Em 2026-10-15 a equipe decidiu tirá-las; ficaram
    só as do onboarding público.
11. **A conexão parada é devolvida ao pooler** (`idle_timeout` de 20 s) e a fila
    tem 2 conexões próprias, como no CRM depois de 2026-10-14: a agenda vai
    dividir o pooler em modo sessão com ele.

## Decidido na construção (fase 7, a confirmar com a equipe)

Na saída para o CRM (7a), em `src/modulos/crm`:

1. **O card mostra a próxima consulta ativa do telefone.** O CRM tem um card por
   contato, e a família divide o número. Criar e remarcar põem o card em
   Agendados com a data da próxima consulta agendada ou confirmada daquele
   telefone (a desta, se for ela). Cancelar e faltar só levam o card a Cancelados
   ou Faltosos quando não sobra outra; se sobra, o card fica em Agendados com a
   data dela, e o CRM marca a remarcação.
2. **O comparecimento passa o card ao CRC2 sempre**, mesmo com outra consulta
   marcada.
3. **"Já feito" encerra a entrega sem erro:** o card no CRC2 ou em outro painel
   (`MOVER_ENTRE_PAINEIS`, `JA_ESTA_EM_OUTRO_PAINEL`) não é mexido, e cancelar sem
   card aberto no CRM não faz nada. O motivo fica no `resultado` do aviso.
4. **O card fechado no CRM** (Perda, Ganho) não é reaberto à força: na próxima
   consulta, o `POST /cards` acha o card aberto do contato ou cria (ou reabre) um,
   como o CRM decide, e a consulta passa a guardar esse.
5. **A hora real do agendamento** vai no `agendadoEm` quando o card entra em
   Agendados pela entrega (o CRM estava fora e a entrega atrasou). O card criado
   já em Agendados fica com a hora da entrega.
6. **Tentativas como os webhooks do CRM:** 30 s, 2 min, 10 min, 30 min, 1 h, 3 h,
   6 h e 12 h, e desiste. Repetem a rede, o CRM fora do ar, o limite de pedidos e
   a chave recusada (401 e 403, que a equipe corrige); a recusa por regra desiste
   na hora.
7. **Uma chave do CRM para a agenda** (`CRM_CHAVE`, do tipo integração, com
   escrita e todas as clínicas), com o `companyId` da clínica no `X-Clinica`,
   como a decisão D4 do modelo. Sem ela no `.env`, os avisos esperam na caixa.
8. **O card é do worker:** a consulta guarda o `crm_card_id` sem mudar de versão,
   e salvar a consulta pela tela não regrava esse campo nem o `lembrete_mensagem_id`.
9. **Os avisos nascem com o instante do caso de uso** (`criado_em` e a primeira
   tentativa), e não com o relógio do banco.

Na entrada do CRM (7b), em `src/modulos/crm` e `src/modulos/agenda/aplicacao/vindas.ts`:

10. **O aviso só diz quando olhar; o que fazer sai do card de agora** (`GET
    /cards/{id}`). O aviso atrasado ou repetido não desfaz o que veio depois: a
    saída para Cancelados só cancela se o card ainda estiver lá.
11. **O encaixe sozinho pede quatro coisas:** a unidade do card ligada a uma da
    agenda (`crm_unidade_id`), o dentista da Clinicorp ligado a um profissional
    (`id_no_prontuario`), o procedimento das vindas da clínica e o nome do
    paciente. A duração é a da Clinicorp, se for múltiplo de 5; senão, a do
    procedimento. A cadeira é a primeira livre, e vale encaixar fora do
    expediente, como a recepção. O que faltar vira o `motivo` da vinda.
12. **O que veio do CRM não volta ao CRM:** a consulta encaixada, remarcada,
    cancelada ou concluída por um aviso entra com o acesso do sistema de origem
    `crm`, que não grava aviso ao CRM (os avisos à plataforma continuam; a fase
    7c decide o lembrete). A recepção, ao encaixar uma vinda, age como ela mesma,
    e o CRM recebe o aviso normal, que não muda nada no card.
13. **Encaixar ensina o vínculo:** o profissional que a recepção escolhe fica
    ligado ao dentista da Clinicorp da vinda, se nenhum dos dois já tem par.
14. **O compareceu do CRM conclui a consulta** (agendada, confirmada ou em
    atendimento). O card que vai para outra coluna (Leads, Perda) só tira a vinda
    pendente da lista: a consulta ligada fica como está.
15. **Uma vinda pendente por card**, e o aviso do CRM é processado um de cada vez
    por card, na ordem de chegada. A mesma entrega repetida entra uma vez só.
16. **A assinatura vale por 10 minutos** para os dois lados, e a agenda guarda o
    segredo do webhook cifrado (`AGENDA_CHAVE_CIFRAGEM`).
17. **O procedimento das vindas não tem chave estrangeira** (o ciclo
    clínicas ↔ procedimentos confunde os tipos do Drizzle): quem grava confere que
    é da clínica; procedimento não se apaga, só se desativa.
18. **As telas da 7b:** o botão "Vindas do CRM" no alto da agenda (só para a
    recepção e o gestor, e só com alguma pendente) abre a lista; cada vinda mostra
    o motivo e se encaixa escolhendo o profissional, o procedimento, a cadeira (ou
    a primeira livre) e, se quiser, outra data e hora. A lista se atualiza a cada
    minuto. Nas Configurações: a ligação com o CRM e o procedimento das vindas
    (aba Geral), a unidade no CRM de cada unidade, numa lista lida do CRM pela
    chave (aba Unidades), e o dentista no prontuário (aba Profissionais).
19. **A vinda sem unidade ligada não se encaixa pela tela:** primeiro o gestor liga
    a unidade da agenda à do CRM.

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
