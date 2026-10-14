// A porta dos outros módulos (e da composição) para as regras de acesso: um
// módulo só fala com outro pela camada aplicacao/ dele (ADR 0001, como no CRM).

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
export { lerHosts } from '../dominio/entrada'
