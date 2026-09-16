import { describe, expect, it } from "vitest";
import {
  completarFinal,
  lerColagem,
  lerCsvDaPrensa,
  numerosDaLinha,
  paraAcumulado,
} from "./importacao";

describe("leitura de números (as duas prensas)", () => {
  it("tabulação com ponto decimal", () => {
    expect(numerosDaLinha("0.10\t0.0450")).toEqual([0.1, 0.045]);
  });

  it("ponto-e-vírgula com vírgula decimal", () => {
    expect(numerosDaLinha("0,10;0,0450")).toEqual([0.1, 0.045]);
  });

  it("espaço com vírgula decimal — o caso que o parser antigo quebrava", () => {
    // O antigo fazia split(/[\t;,\s]+/) e devolvia quatro pedaços: 0, 10, 0, 0450.
    expect(numerosDaLinha("0,10  0,0450")).toEqual([0.1, 0.045]);
  });

  it("vírgula como separador, ponto decimal", () => {
    expect(numerosDaLinha("0.10,0.0450")).toEqual([0.1, 0.045]);
  });

  it("vírgula fazendo os dois papéis, sem outro separador", () => {
    expect(numerosDaLinha("0,10,0,0450")).toEqual([0.1, 0.045]);
  });

  it("linha sem número não vira leitura", () => {
    expect(numerosDaLinha("Tempo;Recalque")).toEqual([]);
    expect(numerosDaLinha("   ")).toEqual([]);
  });
});

describe("colagem de um estágio", () => {
  it("ordena por tempo e descarta cabeçalho", () => {
    const r = lerColagem("Tempo;Leitura\n1,00;0,152\n0,25;0,082\n0,50;0,115");
    expect(r.map((x) => x.t)).toEqual([0.25, 0.5, 1]);
    expect(r[0].d).toBe(0.082);
  });
});

describe("conversão para a convenção do cálculo", () => {
  const leituras = [{ t: 1, d: 0.1 }, { t: 4, d: 0.25 }];

  it("leitura contínua passa direto", () => {
    expect(paraAcumulado(leituras, { modo: "acumulado", sinal: "positivo" })).toEqual(leituras);
  });

  it("prensa que reinicia a cada estágio soma o acumulado anterior", () => {
    const r = paraAcumulado(leituras, { modo: "porEstagio", sinal: "positivo", anterior: 2 });
    expect(r.map((x) => x.d)).toEqual([2.1, 2.25]);
  });

  it("prensa que registra compressão como negativa é invertida", () => {
    const r = paraAcumulado([{ t: 1, d: -0.1 }], { modo: "porEstagio", sinal: "negativo", anterior: 2 });
    expect(r[0].d).toBeCloseTo(2.1, 9);
  });
});

describe("completar o fim da curva", () => {
  // Reta perfeita no log do tempo: d = 0,1·log10(t) + 0,2
  const medidas = [10, 20, 60, 120, 240].map((t) => ({ t, d: 0.1 * Math.log10(t) + 0.2 }));

  it("estende 6 h, 12 h e 24 h pela reta do secundário", () => {
    const r = completarFinal(medidas);
    const novos = r.filter((x) => x.interpolada);
    expect(novos.map((x) => x.t)).toEqual([360, 720, 1440]);
    for (const p of novos) expect(p.d).toBeCloseTo(0.1 * Math.log10(p.t) + 0.2, 5);
  });

  it("marca o que é estimado, para o laudo poder dizer", () => {
    const r = completarFinal(medidas);
    expect(r.filter((x) => !x.interpolada)).toHaveLength(medidas.length);
  });

  it("não inventa ponto que o ensaio já mediu", () => {
    const ate24h = [...medidas, { t: 1440, d: 0.52 }];
    expect(completarFinal(ate24h).filter((x) => x.interpolada)).toHaveLength(0);
  });

  it("dados de menos não viram extrapolação", () => {
    expect(completarFinal([{ t: 1, d: 0.1 }]).filter((x) => x.interpolada)).toHaveLength(0);
  });
});

describe("arquivo da prensa (CSV)", () => {
  // Mesmo formato do arquivo real: cabeçalho solto, `;`, decimal vírgula,
  // coluna Etapa, tempo reiniciando por etapa e deslocamento acumulado.
  const csv = [
    "Numero do Teste;991",
    "ID do ensaio;CIS-001 -991",
    "N. de Etapas;2",
    "Data;Hora;Etapa;Tensao Normal [kPa];Tempo Estagio [min];Deslocamento Normal [mm];Altura Atual [mm]",
    "21/07/2026;07:26:08;0;0;0;0;20",
    "21/07/2026;07:26:15;1;7,193568;0,09;0,1570015;19,843",
    "21/07/2026;07:26:26;1;7,346622;0,25;0,2010002;19,799",
    "21/07/2026;07:27:10;1;7,499677;1;0,321003;19,679",
    "21/07/2026;13:26:17;2;19,8971;0,09;2,136002;17,864",
    "21/07/2026;13:26:27;2;20,05016;0,25;2,162003;17,838",
    "21/07/2026;13:27:12;2;20,05016;1;2,251003;17,749",
  ].join("\n");

  it("separa os estágios pela coluna Etapa, na ordem", () => {
    const est = lerCsvDaPrensa(csv);
    expect(est.map((e) => e.etapa)).toEqual([1, 2]);
    expect(est[0].leituras.map((l) => l.t)).toEqual([0.09, 0.25, 1]);
    expect(est[0].leituras[0].d).toBeCloseTo(0.1570015, 9);
  });

  it("a etapa 0 é assentamento e não vira estágio", () => {
    expect(lerCsvDaPrensa(csv).some((e) => e.etapa === 0)).toBe(false);
  });

  it("a tensão do estágio é a mediana das leituras, não o pico", () => {
    const est = lerCsvDaPrensa(csv);
    expect(est[0].sigma).toBeCloseTo(7.346622, 6);
    expect(est[1].sigma).toBeCloseTo(20.05016, 6);
  });

  it("arquivo sem coluna Etapa não é lido às cegas", () => {
    expect(lerCsvDaPrensa("a;b\n1;2")).toEqual([]);
  });
});
