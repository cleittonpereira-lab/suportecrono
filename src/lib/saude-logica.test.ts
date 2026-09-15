import { describe, expect, it } from "vitest";
import { aparar, avaliarSaude, podeAlertarDeNovo, rotaCurta, type Ocorrencia } from "./saude-logica";

const agora = new Date("2026-09-15T15:00:00.000Z");
const ha = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString();
const erro = (min: number, rota = "/relatorio/pendentes"): Ocorrencia => ({ tipo: "erro", rota, ms: 120, mensagem: "boom", em: ha(min) });
const lenta = (min: number, ms = 9_500): Ocorrencia => ({ tipo: "lenta", rota: "/_serverFn/4852246c57b6ed06c2bd", ms, em: ha(min) });

describe("quando a saúde vira alerta", () => {
  it("5 erros em 15 min: 'Servidor com falhas'", () => {
    const a = avaliarSaude([erro(1), erro(2), erro(3), erro(5), erro(14)], agora);
    expect(a.erros).toBe(5);
    expect(a.alerta?.titulo).toBe("Servidor com falhas");
    expect(a.alerta?.corpo).toContain("boom");
  });

  it("erros fora da janela de 15 min não contam", () => {
    const a = avaliarSaude([erro(1), erro(2), erro(3), erro(4), erro(16)], agora);
    expect(a.erros).toBe(4);
    expect(a.alerta).toBeNull();
  });

  it("3 lentas em 15 min: 'Servidor lento', com a pior em segundos", () => {
    const a = avaliarSaude([lenta(1), lenta(4, 21_300), lenta(9)], agora);
    expect(a.alerta?.titulo).toBe("Servidor lento");
    expect(a.alerta?.corpo).toContain("21,3 s em /_serverFn/4852246c…");
  });

  it("erros vencem lentas quando os dois passam do limite", () => {
    const a = avaliarSaude([lenta(1), lenta(2), lenta(3), erro(1), erro(2), erro(3), erro(4), erro(5)], agora);
    expect(a.alerta?.titulo).toBe("Servidor com falhas");
  });

  it("sem repetir o alerta por 1 hora", () => {
    expect(podeAlertarDeNovo(null, agora)).toBe(true);
    expect(podeAlertarDeNovo(ha(59), agora)).toBe(false);
    expect(podeAlertarDeNovo(ha(60), agora)).toBe(true);
  });

  it("guarda só as últimas 24 h", () => {
    const lista = [erro(60 * 25), erro(60 * 23), erro(1)];
    expect(aparar(lista, agora)).toHaveLength(2);
  });

  it("rota curta para as server functions", () => {
    expect(rotaCurta("/_serverFn/4852246c57b6ed06c2bda0da3f3e3e3730f5b1d8")).toBe("/_serverFn/4852246c…");
    expect(rotaCurta("/relatorio/pendentes")).toBe("/relatorio/pendentes");
  });
});
