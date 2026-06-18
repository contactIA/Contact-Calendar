# O que foi descoberto

- **A duração real já era respeitada.** A `get_available_slots` já calculava o fim do slot como
  `início + duração` e checava conflito sobre o intervalo inteiro. Não dava pra encaixar 90 min
  sobre outra consulta. O bug descrito na tarefa não existia.
- **O único valor fixo era a cadência.** Sobrava `'30 minutes'` apenas como o passo entre os
  horários de início oferecidos (14:00, 14:30, ...) — não é duração, é decisão de produto.
- **Schema sem versionamento.** Não havia migrations no repositório; o schema vivia só no banco.
- **Schema em outra conta.** O projeto-fonte (`escala-agenda`) estava em uma conta Supabase
  diferente da conta de destino.
- **RLS deny-all.** RLS ligado em todas as tabelas, sem policies — acesso só via `service_role`.
