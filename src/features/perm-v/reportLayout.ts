/**
 * Distribui o conteúdo do laudo de PERM.V em páginas A4.
 *
 * O laudo era UMA página fixa (`total={1}`) cujo miolo tem `overflow: hidden`.
 * Com poucas determinações, sem observações e sem fotos cabia com ~30px de
 * folga; qualquer foto, observação ou leitura a mais estourava e o fim do
 * laudo — legenda, fotos, às vezes o segundo gráfico — era cortado em
 * silêncio, tanto na pré-visualização quanto no PDF assinado.
 *
 * O plano é determinístico (mesmos dados → mesmas páginas), então a
 * pré-visualização e o PDF sempre mostram a mesma coisa e o "Folha X / N" do
 * cabeçalho é conhecido antes de renderizar. A medição do DOM entra só como
 * detector de estouro, na geração do PDF (`medirEstouro` em `lib/report-pdf.ts`),
 * nunca como motor do layout.
 */

/**
 * Alturas (px a 96 dpi) medidas no navegador sobre as folhas do próprio laudo,
 * com as amostras sintéticas de `scripts/seed-teste-permv.mjs`:
 * A-MIN (5 determinações), A-DET (12) e A-OBS (15 parágrafos de observação).
 * Tabela: 144 px com 5 linhas e 284 px com 12 → cabeçalho 44 + 20 por linha.
 * Observações: 363 px para 30 linhas → cabeçalho 33 + 11 por linha.
 *
 * As primeiras estimativas (tabela a 17 px/linha, folha útil de 815 px) eram
 * otimistas e deixaram a variante A-TUDO com 44 px cortados na folha 1 — foi a
 * medição que pegou. `miolo` é o `clientHeight` de `.report-content-area`.
 * O laudo mínimo ocupa 786 px dos 796: uma margem maior que 10 px já empurraria
 * a legenda sozinha para uma segunda folha num laudo que sempre coube em uma.
 * Por isso a margem é pequena, e a diferença de fonte entre máquinas que ainda
 * passar é barrada na geração do PDF (`rasterizarRelatorioParaPdf` com
 * `aoEstourar: "erro"`), nunca cortada em silêncio.
 */
export const ALTURAS = {
  miolo: 796,
  margemSeguranca: 8,
  gap: 8,
  // Blocos do cabeçalho técnico (14/09), medidos na página de modelo do PERM.V:
  // dados do ensaio 75 px, corpo de prova 101,8 px, cápsulas 64 + 20 por linha.
  // Cada campo dos dados do ensaio é de uma linha só (texto cortado com
  // reticências), para a altura não depender do conteúdo.
  /** Dados do ensaio (condição da amostra, equipamento, bureta, carga inicial, água, gradiente). */
  ensaio: 76,
  /** Corpo de prova: dimensões, massas e índices físicos (duas faixas de tabela). */
  indices: 102,
  /** Cápsulas de umidade: título + cabeçalho + linha da média, e cada cápsula. */
  capCabecalho: 65,
  capLinha: 20,
  detCabecalho: 44,
  detLinha: 20,
  k20: 32,
  faixa: 79,
  nota: 11,
  obsCabecalho: 33,
  obsLinha: 11,
  grafico: 155,
  /** Legenda com os símbolos do corpo de prova e das cápsulas (146,6 px medidos). */
  legenda: 148,
};

/** Caracteres por linha do bloco de observações (fonte de 8px na largura útil da página). */
export const CARACTERES_POR_LINHA_OBS = 118;
export const FOTOS_POR_PAGINA = 4;

export type BlocoPermV =
  | { tipo: "ensaio" }
  | { tipo: "indices" }
  | { tipo: "capsulas" }
  | { tipo: "determinacoes"; de: number; ate: number; continuacao: boolean; ultimaFatia: boolean }
  | { tipo: "resultado" }
  | { tipo: "nota" }
  | { tipo: "observacoes"; linhas: string[]; continuacao: boolean }
  | { tipo: "grafico-k20" }
  | { tipo: "grafico-h" }
  | { tipo: "legenda" };

export type PaginaPermV =
  | { tipo: "conteudo"; blocos: BlocoPermV[] }
  | { tipo: "fotos"; de: number; ate: number };

export interface EntradaPlano {
  nDeterminacoes: number;
  /** Cápsulas de umidade preenchidas (sem nenhuma, o bloco mostra uma linha "sem determinações"). */
  nCapsulas: number;
  observacoes: string;
  nFotos: number;
  /** Há determinações fora da média (a nota do asterisco aparece). */
  temNota: boolean;
}

/** Quebra o texto nas linhas que ele ocupará impresso (quebras explícitas + quebra por largura). */
export function linhasDasObservacoes(texto: string): string[] {
  const limpo = texto.replace(/\s+$/, "");
  if (!limpo.trim()) return [];
  const out: string[] = [];
  for (const paragrafo of limpo.split("\n")) {
    if (paragrafo.length <= CARACTERES_POR_LINHA_OBS) {
      out.push(paragrafo);
      continue;
    }
    // Quebra por palavra, como o navegador faria.
    let linha = "";
    for (const palavra of paragrafo.split(" ")) {
      const candidata = linha ? `${linha} ${palavra}` : palavra;
      if (candidata.length > CARACTERES_POR_LINHA_OBS && linha) {
        out.push(linha);
        linha = palavra;
      } else {
        linha = candidata;
      }
    }
    if (linha) out.push(linha);
  }
  return out;
}

export function planejarPaginasPermV(e: EntradaPlano): { paginas: PaginaPermV[]; total: number } {
  const A = ALTURAS;
  const limite = A.miolo - A.margemSeguranca;
  const paginas: PaginaPermV[] = [];
  let atual: BlocoPermV[] = [];
  let usado = 0;

  const custo = (h: number) => (atual.length > 0 ? A.gap : 0) + h;
  const cabe = (h: number) => usado + custo(h) <= limite;
  const fechar = () => {
    if (atual.length > 0) paginas.push({ tipo: "conteudo", blocos: atual });
    atual = [];
    usado = 0;
  };
  const colocar = (bloco: BlocoPermV, h: number) => {
    if (!cabe(h)) fechar();
    usado += custo(h);
    atual.push(bloco);
  };

  // Dados do ensaio, corpo de prova (dimensões, massas, índices) e cápsulas de
  // umidade abrem o laudo — antes só havia uma linha de índices, sem as massas
  // nem as cápsulas que os produzem.
  colocar({ tipo: "ensaio" }, A.ensaio);
  colocar({ tipo: "indices" }, A.indices);
  colocar({ tipo: "capsulas" }, A.capCabecalho + Math.max(e.nCapsulas, 1) * A.capLinha);

  // Resultado (k20) e faixa de classificação ficam grudados na última fatia da
  // tabela: o número do laudo nunca aparece numa folha separada dos dados
  // que o produziram.
  const alturaResultado = A.k20 + A.gap + A.faixa + (e.temNota ? A.gap + A.nota : 0);
  // Tabela sem determinações ainda ocupa uma linha ("Sem leituras suficientes…").
  const totalLinhas = Math.max(e.nDeterminacoes, 1);
  let proxima = 0;
  let continuacao = false;
  while (proxima < totalLinhas) {
    const restantes = totalLinhas - proxima;
    const espaco = limite - usado - (atual.length > 0 ? A.gap : 0) - A.detCabecalho;
    let cabemAqui = Math.floor(espaco / A.detLinha);
    if (cabemAqui < 1) {
      fechar();
      continue;
    }
    if (cabemAqui >= restantes) {
      // Todas as linhas restantes cabem. Se o resultado não couber junto,
      // leva uma linha para a próxima folha para ele não ficar sozinho.
      const alturaTabela = A.detCabecalho + restantes * A.detLinha;
      const sobra = limite - usado - (atual.length > 0 ? A.gap : 0) - alturaTabela;
      if (sobra >= A.gap + alturaResultado) {
        cabemAqui = restantes;
      } else {
        cabemAqui = restantes - 1;
        if (cabemAqui < 1) {
          fechar();
          continue;
        }
      }
    }
    const ate = proxima + cabemAqui;
    const ultimaFatia = ate >= totalLinhas;
    usado += custo(A.detCabecalho + cabemAqui * A.detLinha);
    atual.push({ tipo: "determinacoes", de: proxima, ate: Math.min(ate, e.nDeterminacoes), continuacao, ultimaFatia });
    proxima = ate;
    continuacao = true;
    if (!ultimaFatia) fechar();
  }
  usado += custo(A.k20);
  atual.push({ tipo: "resultado" });
  if (e.temNota) {
    usado += custo(A.nota);
    atual.push({ tipo: "nota" });
  }
  // `resultado` já reservou o espaço da faixa acima; ela é desenhada junto.
  usado += A.gap + A.faixa;

  const linhas = linhasDasObservacoes(e.observacoes);
  let li = 0;
  let obsContinuacao = false;
  while (li < linhas.length) {
    const espaco = limite - usado - (atual.length > 0 ? A.gap : 0) - A.obsCabecalho;
    let cabemAqui = Math.floor(espaco / A.obsLinha);
    const restantes = linhas.length - li;
    // Evita começar observações com uma ou duas linhas perdidas no pé da página.
    if (cabemAqui < Math.min(3, restantes)) {
      fechar();
      continue;
    }
    cabemAqui = Math.min(cabemAqui, restantes);
    usado += custo(A.obsCabecalho + cabemAqui * A.obsLinha);
    atual.push({ tipo: "observacoes", linhas: linhas.slice(li, li + cabemAqui), continuacao: obsContinuacao });
    li += cabemAqui;
    obsContinuacao = true;
    if (li < linhas.length) fechar();
  }

  colocar({ tipo: "grafico-k20" }, A.grafico);
  colocar({ tipo: "grafico-h" }, A.grafico);
  colocar({ tipo: "legenda" }, A.legenda);
  fechar();

  for (let i = 0; i < e.nFotos; i += FOTOS_POR_PAGINA) {
    paginas.push({ tipo: "fotos", de: i, ate: Math.min(i + FOTOS_POR_PAGINA, e.nFotos) });
  }

  return { paginas, total: paginas.length };
}
