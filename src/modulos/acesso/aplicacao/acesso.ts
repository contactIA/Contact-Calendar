// A porta dos outros módulos para as regras de acesso: um módulo só fala com
// outro pela camada aplicacao/ dele (ADR 0001, como no CRM). O login pelo item
// de menu entra aqui na fase 8.

export {
  atorDo,
  cuidaDaAgenda,
  ehChave,
  exigirEscrita,
  exigirGestor,
  exigirQueCuidaDaAgenda,
  profissionalVisivel,
  unidadesVisiveis,
  veUnidade,
  type Acesso,
  type AcessoDeChave,
  type AcessoDeUsuario,
  type AcessoDoSistema,
  type Ator,
  type Papeis,
} from '../dominio/acesso'
