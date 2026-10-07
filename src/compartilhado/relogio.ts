/**
 * O instante de agora, como fronteira: os casos de uso pedem a hora a um relógio,
 * e os testes passam um relógio fixo. O domínio nem isso: recebe o instante por
 * parâmetro.
 */
export interface Relogio {
  agora(): Date
}
