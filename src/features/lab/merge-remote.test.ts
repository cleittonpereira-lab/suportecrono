import { describe, expect, it } from "vitest";
import { JANELA_CONSISTENCIA_MS, isLocalNewer, mergeRemote } from "./merge-remote";
import type { LabState } from "./types";

const AGORA = Date.parse("2026-09-10T12:00:00.000Z");
const ha = (ms: number) => new Date(AGORA - ms).toISOString();

function ensaio(id: string, extra: Record<string, unknown> = {}) {
  return { id, tipo: "compressao-simples", createdAt: ha(3_600_000), updatedAt: ha(3_600_000), ...extra };
}
function amostra(id: string, ensaios: unknown[], extra: Record<string, unknown> = {}) {
  return { id, createdAt: ha(3_600_000), updatedAt: ha(3_600_000), ensaios, ...extra };
}
function os(id: string, amostras: unknown[], extra: Record<string, unknown> = {}) {
  return { id, numero: id, createdAt: ha(3_600_000), updatedAt: ha(3_600_000), amostras, ...extra };
}
const estado = (...lista: unknown[]) => ({ os: lista }) as unknown as LabState;
const semSujos = new Set<string>();

describe("mergeRemote — entidades só locais", () => {
  it("mantém um ensaio recém-criado que o servidor ainda não mostra, mesmo já salvo", () => {
    // Criado há 10s, já saiu de dirtyIds (salvou), mas a listagem do Drive
    // ainda não o enxerga. Antes da correção ele sumia da tela.
    const recem = ensaio("en_novo", { createdAt: ha(10_000), updatedAt: ha(10_000) });
    const local = estado(os("os1", [amostra("am1", [ensaio("en_velho"), recem])]));
    const remoto = estado(os("os1", [amostra("am1", [ensaio("en_velho")])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    const ids = r.os[0].amostras[0].ensaios.map((e) => e.id);
    expect(ids).toEqual(["en_velho", "en_novo"]);
  });

  it("descarta um ensaio antigo que só existe localmente (foi apagado no servidor)", () => {
    const local = estado(os("os1", [amostra("am1", [ensaio("en_velho"), ensaio("en_apagado")])]));
    const remoto = estado(os("os1", [amostra("am1", [ensaio("en_velho")])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect(r.os[0].amostras[0].ensaios.map((e) => e.id)).toEqual(["en_velho"]);
  });

  it("a janela vale só até o limite", () => {
    const quase = ensaio("en_a", { createdAt: ha(JANELA_CONSISTENCIA_MS - 1000) });
    const passou = ensaio("en_b", { createdAt: ha(JANELA_CONSISTENCIA_MS + 1000) });
    const local = estado(os("os1", [amostra("am1", [quase, passou])]));
    const remoto = estado(os("os1", [amostra("am1", [])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect(r.os[0].amostras[0].ensaios.map((e) => e.id)).toEqual(["en_a"]);
  });

  it("mantém entidade com gravação pendente, independentemente da idade", () => {
    const local = estado(os("os1", [amostra("am1", [ensaio("en_pendente")])]));
    const remoto = estado(os("os1", [amostra("am1", [])]));

    const r = mergeRemote(local, remoto, new Set(["en_pendente"]), AGORA);
    expect(r.os[0].amostras[0].ensaios.map((e) => e.id)).toEqual(["en_pendente"]);
  });

  it("mantém amostra e OS recém-criadas que o servidor ainda não mostra", () => {
    const amNova = amostra("am_nova", [], { createdAt: ha(5_000) });
    const osNova = os("os_nova", [], { createdAt: ha(5_000) });
    const local = estado(os("os1", [amostra("am1", []), amNova]), osNova);
    const remoto = estado(os("os1", [amostra("am1", [])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect(r.os.map((o) => o.id)).toEqual(["os1", "os_nova"]);
    expect(r.os[0].amostras.map((a) => a.id)).toEqual(["am1", "am_nova"]);
  });
});

describe("mergeRemote — conteúdo", () => {
  it("o servidor vence quando a cópia local não é mais nova", () => {
    const local = estado(os("os1", [amostra("am1", [ensaio("en1", { status: "em_digitacao" })])]));
    const remoto = estado(
      os("os1", [amostra("am1", [ensaio("en1", { status: "aprovado", updatedAt: ha(1000) })])]),
    );

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect((r.os[0].amostras[0].ensaios[0] as { status?: string }).status).toBe("aprovado");
  });

  it("edição local mais recente não é sobrescrita por leitura atrasada do servidor", () => {
    const local = estado(os("os1", [amostra("am1", [ensaio("en1", { operator: "novo", updatedAt: ha(1000) })])]));
    const remoto = estado(os("os1", [amostra("am1", [ensaio("en1", { operator: "velho", updatedAt: ha(60_000) })])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect((r.os[0].amostras[0].ensaios[0] as { operator?: string }).operator).toBe("novo");
  });

  it("reaproveita o mesmo objeto quando nada mudou (não dispara autosave à toa)", () => {
    const en = ensaio("en1");
    const local = estado(os("os1", [amostra("am1", [en])]));
    const remoto = estado(os("os1", [amostra("am1", [{ ...en }])]));

    const r = mergeRemote(local, remoto, semSujos, AGORA);
    expect(r.os[0].amostras[0].ensaios[0]).toBe(en);
  });
});

describe("isLocalNewer", () => {
  it("compara instantes, não texto — fuso diferente não engana", () => {
    // 12:00-03:00 = 15:00Z, que é DEPOIS de 14:00Z. Como texto, "2026-09-10T12"
    // < "2026-09-10T14" e a comparação antiga dava o inverso.
    expect(isLocalNewer({ updatedAt: "2026-09-10T12:00:00-03:00" }, { updatedAt: "2026-09-10T14:00:00Z" })).toBe(true);
  });

  it("sem cópia local, não é mais nova", () => {
    expect(isLocalNewer(undefined, { updatedAt: ha(0) })).toBe(false);
  });
});
