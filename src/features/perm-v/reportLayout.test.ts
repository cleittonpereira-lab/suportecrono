import { describe, expect, it } from "vitest";
import {
  ALTURAS,
  FOTOS_POR_PAGINA,
  linhasDasObservacoes,
  planejarPaginasPermV,
  type BlocoPermV,
  type EntradaPlano,
  type PaginaPermV,
} from "./reportLayout";

const base: EntradaPlano = { nDeterminacoes: 5, nCapsulas: 3, observacoes: "", nFotos: 0, temNota: false };
const limite = ALTURAS.miolo - ALTURAS.margemSeguranca;

function alturaBloco(b: BlocoPermV, e: EntradaPlano): number {
  switch (b.tipo) {
    case "ensaio":
      return ALTURAS.ensaio;
    case "indices":
      return ALTURAS.indices;
    case "capsulas":
      return ALTURAS.capCabecalho + Math.max(e.nCapsulas, 1) * ALTURAS.capLinha;
    case "determinacoes":
      return ALTURAS.detCabecalho + Math.max(b.ate - b.de, 1) * ALTURAS.detLinha;
    case "resultado":
      return ALTURAS.k20 + ALTURAS.gap + ALTURAS.faixa;
    case "nota":
      return ALTURAS.nota;
    case "observacoes":
      return ALTURAS.obsCabecalho + b.linhas.length * ALTURAS.obsLinha;
    case "grafico-k20":
    case "grafico-h":
      return ALTURAS.grafico;
    case "legenda":
      return ALTURAS.legenda;
  }
}

function alturaPagina(p: PaginaPermV, e: EntradaPlano): number {
  if (p.tipo === "fotos") return 0;
  return p.blocos.reduce((s, b, i) => s + (i > 0 ? ALTURAS.gap : 0) + alturaBloco(b, e), 0);
}

function blocos(paginas: PaginaPermV[]): BlocoPermV[] {
  return paginas.flatMap((p) => (p.tipo === "conteudo" ? p.blocos : []));
}

function conferirInvariantes(e: EntradaPlano) {
  const { paginas, total } = planejarPaginasPermV(e);
  expect(total).toBe(paginas.length);

  // Nenhuma página de conteúdo passa do espaço disponível: é exatamente o
  // defeito que cortava o fim do laudo.
  for (const p of paginas) expect(alturaPagina(p, e)).toBeLessThanOrEqual(limite);

  // Toda determinação aparece uma vez, em ordem.
  const fatias = blocos(paginas).filter((b) => b.tipo === "determinacoes") as Extract<BlocoPermV, { tipo: "determinacoes" }>[];
  let esperado = 0;
  for (const f of fatias) {
    expect(f.de).toBe(esperado);
    esperado = f.ate;
  }
  expect(esperado).toBe(e.nDeterminacoes);

  // O resultado vem logo depois da última fatia, na mesma página.
  const pagResultado = paginas.find((p) => p.tipo === "conteudo" && p.blocos.some((b) => b.tipo === "resultado"));
  expect(pagResultado).toBeDefined();
  if (pagResultado?.tipo === "conteudo") {
    const idx = pagResultado.blocos.findIndex((b) => b.tipo === "resultado");
    const anterior = pagResultado.blocos[idx - 1];
    expect(anterior?.tipo).toBe("determinacoes");
    if (anterior?.tipo === "determinacoes") expect(anterior.ultimaFatia).toBe(true);
  }

  // Observações saem completas, sem perder nem duplicar linha.
  const obs = blocos(paginas).filter((b) => b.tipo === "observacoes") as Extract<BlocoPermV, { tipo: "observacoes" }>[];
  expect(obs.flatMap((o) => o.linhas)).toEqual(linhasDasObservacoes(e.observacoes));

  // Nenhum bloco obrigatório some.
  const tipos = blocos(paginas).map((b) => b.tipo);
  for (const t of ["ensaio", "indices", "capsulas", "resultado", "grafico-k20", "grafico-h", "legenda"] as const) {
    expect(tipos.filter((x) => x === t)).toHaveLength(1);
  }
  expect(tipos.includes("nota")).toBe(e.temNota);

  // Toda foto aparece uma vez, em páginas de anexo no fim.
  const fotos = paginas.filter((p) => p.tipo === "fotos") as Extract<PaginaPermV, { tipo: "fotos" }>[];
  expect(fotos.reduce((s, p) => s + (p.ate - p.de), 0)).toBe(e.nFotos);
  for (const p of fotos) expect(p.ate - p.de).toBeLessThanOrEqual(FOTOS_POR_PAGINA);
  const primeiraFoto = paginas.findIndex((p) => p.tipo === "fotos");
  if (primeiraFoto >= 0) expect(paginas.slice(primeiraFoto).every((p) => p.tipo === "fotos")).toBe(true);

  return { paginas, total };
}

describe("planejarPaginasPermV", () => {
  it("laudo mínimo: dados do ensaio, corpo de prova e cápsulas abrem o laudo, na ordem", () => {
    const { paginas, total } = conferirInvariantes(base);
    expect(total).toBeLessThanOrEqual(2);
    expect(blocos(paginas).map((b) => b.tipo)).toEqual([
      "ensaio",
      "indices",
      "capsulas",
      "determinacoes",
      "resultado",
      "grafico-k20",
      "grafico-h",
      "legenda",
    ]);
  });

  it("sem cápsulas preenchidas, o bloco ainda reserva a linha de 'sem determinações'", () => {
    conferirInvariantes({ ...base, nCapsulas: 0 });
  });

  it("muitas cápsulas continuam cabendo na folha", () => {
    conferirInvariantes({ ...base, nCapsulas: 8, nDeterminacoes: 20 });
  });

  it("sem determinações ainda reserva a linha de 'sem leituras' e não perde o resultado", () => {
    conferirInvariantes({ ...base, nDeterminacoes: 0 });
  });

  it("muitas determinações quebram a tabela e mantêm o k20 junto da última fatia", () => {
    const { total } = conferirInvariantes({ ...base, nDeterminacoes: 60 });
    expect(total).toBeGreaterThan(1);
  });

  it.each([1, 5, 11, 12, 20, 29, 30, 31, 45])("%i determinações respeitam o espaço da página", (n) => {
    conferirInvariantes({ ...base, nDeterminacoes: n, temNota: n % 2 === 0 });
  });

  it("observações longas saem inteiras, quebradas entre páginas se preciso", () => {
    const texto = Array.from({ length: 90 }, (_, i) => `Linha ${i + 1} de observação técnica do ensaio.`).join("\n");
    const { total } = conferirInvariantes({ ...base, observacoes: texto });
    expect(total).toBeGreaterThan(1);
  });

  it("6 fotos viram 2 folhas de anexo (4 + 2)", () => {
    const { paginas } = conferirInvariantes({ ...base, nFotos: 6 });
    const fotos = paginas.filter((p) => p.tipo === "fotos");
    expect(fotos).toEqual([
      { tipo: "fotos", de: 0, ate: 4 },
      { tipo: "fotos", de: 4, ate: 6 },
    ]);
  });

  it("tudo junto: número de folhas bate com o plano", () => {
    conferirInvariantes({
      nDeterminacoes: 12,
      nCapsulas: 3,
      observacoes: "Amostra com trincas visíveis após a moldagem.\n".repeat(15),
      nFotos: 6,
      temNota: true,
    });
  });
});

describe("linhasDasObservacoes", () => {
  it("vazio não gera bloco", () => {
    expect(linhasDasObservacoes("   \n  ")).toEqual([]);
  });

  it("parágrafo longo quebra por palavra sem perder texto", () => {
    const longo = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(" ");
    const linhas = linhasDasObservacoes(longo);
    expect(linhas.length).toBeGreaterThan(1);
    expect(linhas.join(" ")).toBe(longo);
  });
});
