import { describe, expect, it } from "vitest";
import {
  aguardaBaixa,
  analisarAtencao,
  pontosDeAtencao,
  resumoAtencao,
} from "./atencao";
import {
  aplicarPatch,
  mesclarImportacao,
  novoRegistro,
  verificacaoVale,
  type CptuLinhaImportada,
  type CptuRegistro,
} from "./logic";

const base = {
  status: "CONCLUIDO" as const,
  profundidade: 5,
  obsCampo: "",
  criterio: "PENETRAÇÃO PREVISTA DO CPTU ATÉ 10 METROS DE PROFUNDIDADE",
};

describe("analisarAtencao — cancelados", () => {
  const cancelado = (obsCampo: string) =>
    analisarAtencao({ ...base, status: "CANCELADO", profundidade: 0, obsCampo });

  it("sem acesso e caminho de serviço podem ser refeitos", () => {
    expect(cancelado("SONDAGEM CANCELADA: SEM CONDIÇÕES DE ACESSO.")?.possibilidade).toBe("SIM");
    expect(cancelado("Necessário caminho de serviço")?.grupo).toBe("Acesso / logística");
  });

  it("sonda que quebrou a esteira após falta de acesso continua refazível", () => {
    const a = cancelado("Sem condições de acesso, na tentativa, sonda quebrou a esteira.");
    expect(a?.grupo).toBe("Equipamento");
    expect(a?.possibilidade).toBe("SIM");
  });

  it("cancelado pelo cliente não se refaz por iniciativa própria", () => {
    expect(cancelado("Cliente solicitou cancelamento dessa sondagem")?.possibilidade).toBe("NAO");
    expect(cancelado("Ensaio cancelado por autorização do cliente")?.possibilidade).toBe("NAO");
  });

  it("balsa é logística, não cliente, mesmo com 'cancelado pelo cliente' na frase", () => {
    expect(
      cancelado("Ponto cancelado pelo cliente por não ter condição de deslocamento da balsa")
        ?.possibilidade,
    ).toBe("SIM");
  });

  it("programação atualizada aponta a OS citada para conferir", () => {
    const a = cancelado("SONDAGEM CANCELADA: PROGRAMAÇÃO ATUALIZADA NA OS 14277-23.");
    expect(a?.possibilidade).toBe("VERIFICAR");
    expect(a?.osCitada).toBe("14277-23");
  });

  it("espera de liberação ou autorização depende de terceiros", () => {
    expect(cancelado("SONDAGEM CANCELADA: AGUARDADO LIBERAÇÃO DA CETESB.")?.possibilidade).toBe(
      "DEPENDE",
    );
    expect(
      cancelado("Propriedade do Sr. Rodolfo. Cliente ciente. E-mail enviado")?.possibilidade,
    ).toBe("DEPENDE");
  });

  it("solo de alta capacidade pede avaliação técnica", () => {
    expect(cancelado("SONDAGEM CANCELADA: SOLO DE ALTA CAPACIDADE (NSTP ALTO).")?.possibilidade).toBe(
      "AVALIAR",
    );
  });

  it("sem motivo registrado vai para verificar, não some", () => {
    const a = cancelado("");
    expect(a?.grupo).toBe("Sem motivo");
    expect(a?.possibilidade).toBe("VERIFICAR");
  });

  it("texto que nenhuma regra conhece vira 'Não classificado'", () => {
    expect(cancelado("Texto totalmente novo do campo")?.grupo).toBe("Não classificado");
  });

  it("aspas soltas do extrato contam como sem motivo", () => {
    expect(cancelado('"')?.grupo).toBe("Sem motivo");
  });
});

describe("analisarAtencao — concluídos", () => {
  it("concluído com 0,01 m não foi executado, mesmo sem descrição", () => {
    const a = analisarAtencao({ ...base, profundidade: 0.01, obsCampo: "" });
    expect(a?.grupo).toBe("Concluído sem execução");
    expect(a?.possibilidade).toBe("SIM");
  });

  it("impenetrável até 1 m é raso: avaliar técnica", () => {
    const a = analisarAtencao({
      ...base,
      profundidade: 0.4,
      obsCampo: "Furo impenetrável. Foi realizado deslocamento A e B",
    });
    expect(a?.grupo).toBe("Impenetrável");
    expect(a?.possibilidade).toBe("AVALIAR");
    expect(a?.motivo).toBe("Impenetrável a 0,4 m");
    expect(a?.acao).toMatch(/Deslocamento já feito/);
  });

  it("paralisado depois de 1 m fica para verificar", () => {
    const a = analisarAtencao({
      ...base,
      profundidade: 2.5,
      obsCampo: "FURO IMPENETRÁVEL - FOI REALIZADO DESLOCAMENTO A",
    });
    expect(a?.possibilidade).toBe("VERIFICAR");
  });

  it("parada que já chegou à profundidade prevista não é pendência", () => {
    const a = analisarAtencao({
      ...base,
      profundidade: 9.9,
      obsCampo: "Furo impenetrável",
    });
    expect(a).toBeNull();
  });

  it("dissipação não feita por camada resistente pede verificação", () => {
    const a = analisarAtencao({
      ...base,
      profundidade: 2.6,
      obsCampo: "Não foi possível realizar a dissipação devido presença de camada muito resistente",
    });
    expect(a?.motivo).toMatch(/Dissipação não feita/);
  });

  it("descrição de coordenadas não gera ponto de atenção", () => {
    const a = analisarAtencao({
      ...base,
      profundidade: 6,
      obsCampo: "Coordenadas preliminares, dado de cota ausente.",
    });
    expect(a).toBeNull();
  });

  it("pendente nunca tem ponto de atenção", () => {
    expect(analisarAtencao({ ...base, status: "PENDENTE", obsCampo: "Sem acesso" })).toBeNull();
  });
});

function linha(over: Partial<CptuLinhaImportada> = {}): CptuLinhaImportada {
  return {
    os: "18205-26",
    identificacao: "CPTU-001",
    tipo: "CPTU",
    lat: -25.5,
    lng: -49.3,
    status: "CANCELADO",
    desde: "2026-10-01",
    dataFimOs: null,
    profundidade: 0,
    obsCampo: "SONDAGEM CANCELADA: SEM CONDIÇÕES DE ACESSO.",
    criterio: "ATÉ 10 METROS",
    ...over,
  };
}

const EM = "2026-10-22T12:00:00.000Z";
const novoRegistroParaTeste = (l: CptuLinhaImportada): CptuRegistro => novoRegistro(l, EM, "x");

describe("baixa de atenção verificada", () => {
  it("dar baixa grava quem, quando e a foto da situação", () => {
    const r = novoRegistroParaTeste(linha());
    const baixado = aplicarPatch(r, { atencaoVerificada: true }, EM, "Ana");
    expect(verificacaoVale(baixado)).toBe(true);
    expect(baixado.atencaoVerificadaPor).toBe("Ana");
    expect(baixado.historico.at(-1)).toMatchObject({ campo: "atenção verificada", para: "Sim" });
  });

  it("reabrir desfaz a baixa", () => {
    const baixado = aplicarPatch(novoRegistroParaTeste(linha()), { atencaoVerificada: true }, EM, "Ana");
    const aberto = aplicarPatch(baixado, { atencaoVerificada: false }, EM, "Ana");
    expect(verificacaoVale(aberto)).toBe(false);
    expect(aberto.atencaoVerificadaEm).toBe("");
  });

  it("a baixa sobrevive a uma nova importação com o mesmo texto", () => {
    const doc0 = mesclarImportacao(null, [linha()], { em: EM, por: "x", arquivo: "a.csv" }).doc;
    const id = Object.keys(doc0.registros)[0];
    const doc1 = {
      ...doc0,
      registros: {
        [id]: aplicarPatch(doc0.registros[id], { atencaoVerificada: true, atencaoNota: "ok" }, EM, "Ana"),
      },
    };
    const doc2 = mesclarImportacao(doc1, [linha()], { em: EM, por: "x", arquivo: "b.csv" }).doc;
    const r = doc2.registros[id];
    expect(verificacaoVale(r)).toBe(true);
    expect(r.atencaoNota).toBe("ok");
  });

  it("a baixa deixa de valer quando a SOND muda a descrição", () => {
    const doc0 = mesclarImportacao(null, [linha()], { em: EM, por: "x", arquivo: "a.csv" }).doc;
    const id = Object.keys(doc0.registros)[0];
    const baixado = aplicarPatch(doc0.registros[id], { atencaoVerificada: true }, EM, "Ana");
    const doc1 = { ...doc0, registros: { [id]: baixado } };
    const doc2 = mesclarImportacao(
      doc1,
      [linha({ obsCampo: "SONDAGEM CANCELADA: AGUARDANDO LIBERAÇÃO DO CLIENTE." })],
      { em: EM, por: "x", arquivo: "b.csv" },
    ).doc;
    const r = doc2.registros[id];
    expect(verificacaoVale(r)).toBe(false);
    expect(r.atencaoVerificadaEm).not.toBe(""); // guarda a baixa antiga para mostrar o aviso
    expect(aguardaBaixa(r)).toBe(true);
  });

  it("a baixa deixa de valer quando a SOND muda o status", () => {
    const r = aplicarPatch(novoRegistroParaTeste(linha()), { atencaoVerificada: true }, EM, "Ana");
    expect(verificacaoVale({ ...r, status: "PRIORIDADE" })).toBe(false);
  });

  it("registros antigos, sem os campos novos, contam como não verificados", () => {
    const antigo = novoRegistroParaTeste(linha()) as Partial<CptuRegistro>;
    delete antigo.atencaoVerificadaEm;
    delete antigo.atencaoSnapshot;
    expect(verificacaoVale(antigo as CptuRegistro)).toBe(false);
  });

  it("resumo separa o que falta dar baixa", () => {
    const a = novoRegistroParaTeste(linha());
    const b = aplicarPatch(novoRegistroParaTeste(linha({ identificacao: "CPTU-002" })), { atencaoVerificada: true }, EM, "Ana");
    const itens = pontosDeAtencao([a, b]);
    const r = resumoAtencao(itens);
    expect(r.total).toBe(2);
    expect(r.verificadas).toBe(1);
    expect(r.aguardandoBaixa).toBe(1);
  });
});
