import { describe, expect, it } from "vitest";
import {
  PERFIS,
  ajustarCurva,
  lowess,
  percentilMovel,
  sugerirMetodo,
  type Ponto,
} from "./ajuste-curvas";

/** Ruído reprodutível (LCG) — teste com random de verdade fica instável. */
function ruidoSemeado(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5; // [-0,5; 0,5)
  };
}

/** Curva hiperbólica típica de endurecimento: σd = ε/(a+b·ε). */
const hiperbolica = (e: number) => e / (0.02 + 0.006 * e);

function curvaComRuido(f: (x: number) => number, amplitude: number, semente = 7): Ponto[] {
  const r = ruidoSemeado(semente);
  const pts: Ponto[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = i * 0.5;
    pts.push({ x, y: f(x) + r() * amplitude });
  }
  return pts;
}

describe("contrato do ajuste (é o que permite gravar de volta no ensaio)", () => {
  it("devolve um ponto por ponto recebido, na mesma ordem e com o mesmo x", () => {
    const brutos = curvaComRuido(hiperbolica, 20);
    const r = ajustarCurva(brutos, { metodo: "lowess" });
    expect(r.pontos).toHaveLength(brutos.length);
    r.pontos.forEach((p, i) => {
      expect(p.x).toBe(brutos[i].x);
      expect(p.yBruto).toBe(brutos[i].y);
    });
  });

  it("não colapsa x repetidos nem apara cauda repetida", () => {
    const brutos: Ponto[] = [
      { x: 0, y: 0 }, { x: 1, y: 10 }, { x: 1, y: 12 },
      { x: 2, y: 20 }, { x: 3, y: 20 }, { x: 4, y: 20 },
    ];
    const r = ajustarCurva(brutos, { metodo: "mediana", janela: 3 });
    expect(r.pontos).toHaveLength(6);
    expect(r.pontos.map((p) => p.x)).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it("pontos não numéricos passam intactos e não contaminam o resto", () => {
    const brutos: Ponto[] = [
      { x: 0, y: 0 }, { x: 1, y: 10 },
      { x: 2, y: NaN }, { x: 3, y: 30 }, { x: 4, y: 41 },
    ];
    const r = ajustarCurva(brutos, { metodo: "mediana", janela: 3 });
    expect(Number.isNaN(r.pontos[2].yAjustado)).toBe(true);
    expect(r.pontos[3].yAjustado).toBeGreaterThan(0);
    expect(Number.isFinite(r.rmse)).toBe(true);
  });

  it("curva vazia não quebra", () => {
    expect(ajustarCurva([], { metodo: "lowess" }).pontos).toEqual([]);
  });
});

describe("envelope: subir a curva é decisão de engenharia, não padrão", () => {
  const brutos = curvaComRuido(hiperbolica, 30, 3);
  const verdadeiro = brutos.map((p) => hiperbolica(p.x));
  const viesMedio = (q: number) => {
    const r = ajustarCurva(brutos, { metodo: "mediana", janela: 9, percentil: q });
    const difs = r.pontos.map((p, i) => p.yAjustado - verdadeiro[i]);
    return difs.reduce((a, b) => a + b, 0) / difs.length;
  };

  it("percentil 0,8 sobe a curva acima do valor real", () => {
    expect(viesMedio(0.8)).toBeGreaterThan(3);
  });

  it("mediana (0,5) praticamente não enviesa", () => {
    expect(Math.abs(viesMedio(0.5))).toBeLessThan(Math.abs(viesMedio(0.8)) / 3);
  });

  it("só tensão desviadora e cisalhante permitem envelope superior", () => {
    expect(PERFIS["tensao-desviadora"].permiteEnvelopeSuperior).toBe(true);
    expect(PERFIS["tensao-cisalhante"].permiteEnvelopeSuperior).toBe(true);
    for (const v of ["poropressao", "variacao-volumetrica", "deslocamento-vertical"] as const) {
      expect(PERFIS[v].permiteEnvelopeSuperior).toBe(false);
      expect(PERFIS[v].percentilPadrao).toBe(0.5);
      expect(PERFIS[v].permiteNegativo).toBe(true);
      expect(PERFIS[v].forcarZeroInicial).toBe(false);
    }
  });
});

describe("modelos", () => {
  it("Kondner recupera a curva conhecida por baixo do ruído", () => {
    const brutos = curvaComRuido(hiperbolica, 25, 11);
    const r = ajustarCurva(brutos, {
      metodo: "kondner", janela: 7, percentil: 0.5, permiteNegativo: false,
    });
    expect(r.r2).toBeGreaterThan(0.9);
    const ajustada = r.pontos.map((p) => p.yAjustado);
    // Hiperbólica é monotônica crescente — o ajuste tem de sair monotônico.
    for (let i = 1; i < ajustada.length; i++) {
      expect(ajustada[i]).toBeGreaterThanOrEqual(ajustada[i - 1] - 1e-9);
    }
  });

  it("suaviza: a curva ajustada oscila menos que o dado bruto", () => {
    const brutos = curvaComRuido(hiperbolica, 30, 5);
    const rugosidade = (v: number[]) =>
      v.slice(1, -1).reduce((s, _, i) => s + Math.abs(v[i + 2] - 2 * v[i + 1] + v[i]), 0);
    const r = ajustarCurva(brutos, { metodo: "lowess", janela: 7, percentil: 0.5 });
    expect(rugosidade(r.pontos.map((p) => p.yAjustado)))
      .toBeLessThan(rugosidade(brutos.map((p) => p.y)) / 3);
  });

  it("permiteNegativo: preserva recalque negativo ou leva a zero, conforme o perfil", () => {
    const brutos: Ponto[] = Array.from({ length: 20 }, (_, i) => ({ x: i, y: -0.5 - i * 0.05 }));
    const livre = ajustarCurva(brutos, { metodo: "lowess", permiteNegativo: true });
    expect(Math.min(...livre.pontos.map((p) => p.yAjustado))).toBeLessThan(0);
    const travado = ajustarCurva(brutos, { metodo: "lowess", permiteNegativo: false });
    expect(Math.min(...travado.pontos.map((p) => p.yAjustado))).toBe(0);
  });

  it("forçar zero inicial só mexe no primeiro ponto", () => {
    const brutos = curvaComRuido(hiperbolica, 10, 2);
    const r = ajustarCurva(brutos, { metodo: "lowess", forcarZeroInicial: true });
    expect(r.pontos[0].yAjustado).toBe(0);
    expect(r.pontos[1].yAjustado).not.toBe(0);
  });

  it("RMSE e R² são medidos contra o dado medido, não contra o envelope", () => {
    const brutos = curvaComRuido(hiperbolica, 25, 9);
    const r = ajustarCurva(brutos, { metodo: "mediana", janela: 7, percentil: 0.9 });
    // Um envelope alto cola no próprio envelope, mas se afasta do dado real:
    // o RMSE tem de enxergar esse afastamento.
    expect(r.rmse).toBeGreaterThan(5);
  });
});

describe("sugestão de método", () => {
  const comPico = (x: number) => {
    const p = 8;
    return 120 * (x / p) ** 2 * Math.exp(2 * (1 - x / p));
  };

  it("curva com pico: escolhe um modelo que captura amolecimento", () => {
    const s = sugerirMetodo(curvaComRuido(comPico, 8, 13), PERFIS["tensao-desviadora"]);
    expect(s).not.toBeNull();
    expect(s!.temPico).toBe(true);
    expect(["weibull", "kondner-amolecimento"]).toContain(s!.melhor);
  });

  it("curva monotônica: não inventa pico", () => {
    const s = sugerirMetodo(curvaComRuido(hiperbolica, 15, 17), PERFIS["tensao-desviadora"]);
    expect(s!.temPico).toBe(false);
  });

  it("poropressão: só sugere suavização, nunca modelo de resistência", () => {
    const u = (x: number) => 200 + 40 * Math.sin(x / 6) - x * 1.5;
    const s = sugerirMetodo(curvaComRuido(u, 10, 23), PERFIS.poropressao);
    expect(["lowess", "mediana", "polinomial"]).toContain(s!.melhor);
    expect(s!.ranking.every((m) => PERFIS.poropressao.metodos.includes(m.metodo))).toBe(true);
    // Sem envelope superior, o grid de percentis não sai de 0,5.
    expect(s!.ranking.every((m) => m.percentil === 0.5)).toBe(true);
  });

  it("poucos pontos: não sugere nada", () => {
    expect(sugerirMetodo([{ x: 0, y: 0 }, { x: 1, y: 1 }], PERFIS["tensao-desviadora"])).toBeNull();
  });
});

describe("filtros isolados", () => {
  it("percentil móvel com q=0,5 é mediana e derruba o ponto espúrio", () => {
    const v = [10, 10, 100, 10, 10];
    expect(percentilMovel(v, 3, 0.5)).toEqual([10, 10, 10, 10, 10]);
  });

  it("LOWESS reproduz uma reta", () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    const y = x.map((v) => 3 * v + 5);
    lowess(x, y, 0.4).forEach((v, i) => expect(v).toBeCloseTo(y[i], 6));
  });
});
