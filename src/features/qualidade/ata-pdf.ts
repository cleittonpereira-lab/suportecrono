/**
 * PDF da ata: dados da reunião, quem participou, o que foi cobrado da reunião
 * anterior, as decisões e ações definidas (com responsáveis, prazos e
 * situação) e o que ainda está pendente. Desenhado direto com o jsPDF (texto
 * selecionável, arquivo pequeno) — sem rasterizar tela.
 */
import {
  dataBr,
  diasParaPrazo,
  itemAtrasado,
  nomeDoArquivoDaAta,
  resumirReuniao,
  STATUS_ITEM_LABEL,
  STATUS_REUNIAO_LABEL,
  TIPO_LABEL,
  tituloDaReuniao,
  type ItemAta,
  type PendenciaAberta,
  type Reuniao,
} from "@/lib/atas-qualidade";

type Doc = import("jspdf").jsPDF;
type RGB = readonly [number, number, number];

const A4 = { w: 210, h: 297 };
const M = { x: 10, top: 48, bottom: 30 };
const LARGURA = A4.w - M.x * 2;
const COR = {
  texto: [30, 30, 30] as const,
  suave: [110, 110, 110] as const,
  linha: [200, 200, 200] as const,
  fundo: [244, 244, 244] as const,
  marca: [240, 180, 60] as const,
  tinta: [20, 20, 20] as const,
  vermelho: [190, 30, 30] as const,
  verde: [30, 120, 60] as const,
};

/** Troca o que a fonte padrão do PDF (Latin-1) não desenha. */
export function paraLatin1(s: string): string {
  return s
    .replace(/[→⇒➜]/g, "->")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[✓✔]/g, "OK")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/[^\u0009\u000A -ÿ–—•…]/g, "?");
}

async function logoComoDataUrl(): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const res = await fetch("/suporte-infra-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = await new Promise<string>((ok, erro) => {
      const fr = new FileReader();
      fr.onerror = () => erro(fr.error);
      fr.onload = () => ok(fr.result as string);
      fr.readAsDataURL(blob);
    });
    const dim = await new Promise<{ w: number; h: number }>((ok, erro) => {
      const img = new Image();
      img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => erro(new Error("logo"));
      img.src = url;
    });
    return { url, ...dim };
  } catch {
    return null;
  }
}


const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "1 de outubro de 2026" e "01/10/2026 16:20" no horário de São Paulo. */
function agoraEmSaoPaulo(): { extenso: string; carimbo: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  const dia = parseInt(g("day"), 10), mes = parseInt(g("month"), 10) - 1, ano = g("year");
  return { extenso: `${dia} de ${MESES[mes]} de ${ano}`, carimbo: `${g("day")}/${g("month")}/${ano} ${g("hour")}:${g("minute")}` };
}

/**
 * Cabeçalho padrão da Suporte Infra (o mesmo dos laudos: logo à esquerda,
 * título no centro, quadro de campos embaixo) — com os campos da REUNIÃO no
 * lugar dos da amostra.
 */
function desenharCabecalho(doc: Doc, logo: Awaited<ReturnType<typeof logoComoDataUrl>>, r: Reuniao, folha: number, total: number, presentes: number) {
  const x = M.x, y = 6, w = A4.w - M.x * 2, hTopo = 20, hLinha = 6;
  doc.setDrawColor(...COR.tinta).setLineWidth(0.3);
  doc.rect(x, y, w, hTopo + hLinha * 3);
  const wLogo = w * 0.27;
  doc.line(x + wLogo, y + 3, x + wLogo, y + hTopo - 3);
  if (logo) {
    const h = 11;
    const lw = Math.min((h * logo.w) / logo.h, wLogo - 8);
    doc.addImage(logo.url, "PNG", x + (wLogo - lw) / 2, y + (hTopo - h) / 2, lw, (lw * logo.h) / logo.w);
  }
  const cx = x + wLogo + (w - wLogo) / 2;
  doc.setTextColor(...COR.tinta).setFont("helvetica", "bold").setFontSize(11);
  const t1 = "ATA DE REUNIÃO";
  doc.text(t1, cx, y + 7.5, { align: "center" });
  const tw = doc.getTextWidth(t1);
  doc.setLineWidth(0.25).line(cx - tw / 2, y + 8.3, cx + tw / 2, y + 8.3);
  doc.setFontSize(10);
  const titulo = doc.splitTextToSize(paraLatin1(tituloDaReuniao(r)), w - wLogo - 8) as string[];
  doc.text(titulo[0], cx, y + 13, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  doc.text(paraLatin1(r.grupo), cx, y + 17.5, { align: "center" });

  // Quadro de campos (3 colunas × 3 linhas), como o dos laudos.
  const col = w / 3;
  const horario = r.horaInicio ? `${r.horaInicio}${r.horaFim ? ` às ${r.horaFim}` : ""}` : "—";
  const campos: [string, string][][] = [
    [["Grupo:", r.grupo], ["Reunião nº:", String(r.numero).padStart(2, "0")], ["Data:", dataBr(r.data)]],
    [["Local:", r.local || "—"], ["Horário:", horario], ["Situação:", STATUS_REUNIAO_LABEL[r.status]]],
    [["Redator:", r.redator || r.criadaPor], ["Presentes:", `${presentes} de ${r.participantes.length}`], ["Folha:", `${folha} / ${total}`]],
  ];
  campos.forEach((linha, li) => {
    const ly = y + hTopo + li * hLinha;
    doc.setDrawColor(...COR.tinta).setLineWidth(0.25).line(x, ly, x + w, ly);
    linha.forEach(([rot, val], ci) => {
      doc.setFontSize(8).setFont("helvetica", "bold").text(paraLatin1(rot), x + ci * col + 2, ly + 4);
      const rw = doc.getTextWidth(rot) + 1.5;
      doc.setFont("helvetica", "normal");
      const cabe = doc.splitTextToSize(paraLatin1(val), col - rw - 3) as string[];
      doc.text(cabe[0] + (cabe.length > 1 ? "…" : ""), x + ci * col + 2 + rw, ly + 4);
    });
  });
}

/** Rodapé padrão: quem redigiu, data e a faixa escura com o endereço do laboratório. */
function desenharRodape(doc: Doc, r: Reuniao, geradoPor: string) {
  const x = M.x, w = A4.w - M.x * 2, base = A4.h;
  const { extenso, carimbo } = agoraEmSaoPaulo();
  doc.setDrawColor(...COR.linha).setLineWidth(0.2).line(x, base - 25, x + w, base - 25);
  doc.setTextColor(...COR.tinta).setFont("helvetica", "bold").setFontSize(8);
  doc.text(paraLatin1(`São Paulo, ${extenso}`), x, base - 21);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...COR.suave);
  doc.text(paraLatin1(`Ata redigida por: ${r.redator || r.criadaPor}`), x, base - 17.5);
  if (r.encerradaPor) doc.text(paraLatin1(`Ata encerrada por: ${r.encerradaPor}`), x, base - 14.5);
  const nota = doc.splitTextToSize("Este documento registra o que foi discutido e decidido em reunião. A reprodução somente poderá ser feita na íntegra.", w * 0.45) as string[];
  doc.text(nota, x + w * 0.55, base - 21);
  // Faixa escura com o endereço (igual à dos laudos).
  doc.setFillColor(...COR.tinta).rect(x, base - 12.5, w, 8.5, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(7);
  doc.text("SUPORTE INFRA", x + 3, base - 9);
  doc.setFont("helvetica", "normal").setFontSize(6.5);
  doc.text("Av. Camélia Borges Narciso, 582 · Bela São Pedro · São Pedro/SP · CEP 13.520-000", x + 3, base - 6);
  doc.text("http://www.suportesolos.com.br", x + w - 3, base - 9, { align: "right" });
  doc.text("contato@suportesolos.com.br", x + w - 3, base - 6, { align: "right" });
  doc.setTextColor(...COR.suave).setFontSize(5.5);
  doc.text(paraLatin1(`Documento gerado em: São Paulo, SP - Brasil · ${carimbo} · ${geradoPor}`), x + w, base - 2, { align: "right" });
}

export interface DadosDoPdf {
  reuniao: Reuniao;
  /** Reunião imediatamente anterior do grupo (para o acompanhamento), se houver. */
  anterior: Reuniao | null;
  /** Ações ainda em aberto até esta reunião (ela inclusive). */
  pendencias: PendenciaAberta[];
  hoje: string;
  geradoPor: string;
  /** Só para testes: logo já carregado (no navegador ele é buscado em /suporte-infra-logo.png). */
  logo?: { url: string; w: number; h: number } | null;
}

type Coluna = { titulo: string; largura: number };

class Pagina {
  y = M.top;
  constructor(readonly doc: Doc) {}

  garantir(altura: number) {
    if (this.y + altura <= A4.h - M.bottom) return;
    this.doc.addPage();
    this.y = M.top;
  }

  texto(t: string, o: { tam?: number; negrito?: boolean; cor?: readonly [number, number, number]; x?: number; largura?: number; espaco?: number } = {}) {
    const { doc } = this;
    const tam = o.tam ?? 10;
    doc.setFont("helvetica", o.negrito ? "bold" : "normal").setFontSize(tam).setTextColor(...(o.cor ?? COR.texto));
    const linhas = doc.splitTextToSize(paraLatin1(t), o.largura ?? LARGURA) as string[];
    const alt = tam * 0.3528 * 1.35;
    for (const l of linhas) {
      this.garantir(alt);
      doc.text(l, o.x ?? M.x, this.y + alt * 0.8);
      this.y += alt;
    }
    this.y += o.espaco ?? 0;
  }

  secao(titulo: string) {
    this.garantir(14);
    this.y += 3;
    this.doc.setFillColor(...COR.fundo).rect(M.x, this.y, LARGURA, 6.5, "F");
    this.doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...COR.texto);
    this.doc.text(paraLatin1(titulo.toUpperCase()), M.x + 2, this.y + 4.5);
    this.y += 9;
  }

  tabela(colunas: Coluna[], linhas: { celulas: string[]; destaque?: "atraso" | "ok" }[]) {
    const { doc } = this;
    const total = colunas.reduce((s, c) => s + c.largura, 0);
    const k = LARGURA / total;
    const larg = colunas.map((c) => c.largura * k);
    const tam = 8.5;
    const alt = tam * 0.3528 * 1.3;
    const pad = 1.6;

    const cabecalho = () => {
      this.garantir(8);
      doc.setFont("helvetica", "bold").setFontSize(tam).setTextColor(...COR.suave);
      let x = M.x;
      colunas.forEach((c, i) => {
        doc.text(paraLatin1(c.titulo), x + pad, this.y + 4);
        x += larg[i];
      });
      doc.setDrawColor(...COR.linha).setLineWidth(0.3).line(M.x, this.y + 6, M.x + LARGURA, this.y + 6);
      this.y += 6.5;
    };
    cabecalho();

    for (const linha of linhas) {
      doc.setFont("helvetica", "normal").setFontSize(tam);
      const quebradas = linha.celulas.map((c, i) => doc.splitTextToSize(paraLatin1(c || "—"), larg[i] - pad * 2) as string[]);
      const nLinhas = Math.max(...quebradas.map((q) => q.length));
      const h = nLinhas * alt + pad * 2;
      if (this.y + h > A4.h - M.bottom) {
        doc.addPage();
        this.y = M.top;
        cabecalho();
      }
      const cor: RGB = linha.destaque === "atraso" ? COR.vermelho : linha.destaque === "ok" ? COR.verde : COR.texto;
      let x = M.x;
      quebradas.forEach((q, i) => {
        // Só a coluna de situação (última) ganha a cor de destaque.
        const c: RGB = i === quebradas.length - 1 ? cor : COR.texto;
        doc.setTextColor(...c).setFont("helvetica", i === quebradas.length - 1 && linha.destaque ? "bold" : "normal");
        q.forEach((l, j) => doc.text(l, x + pad, this.y + pad + alt * 0.8 + j * alt));
        x += larg[i];
      });
      this.y += h;
      doc.setDrawColor(...COR.linha).setLineWidth(0.15).line(M.x, this.y, M.x + LARGURA, this.y);
    }
    this.y += 2;
  }
}

function linhaDoItem(it: ItemAta, hoje: string, comReuniao?: Reuniao) {
  const atraso = itemAtrasado(it, hoje);
  const dias = diasParaPrazo(it.prazo, hoje);
  const prazo = it.prazo ? `${dataBr(it.prazo)}${atraso && dias ? ` (${dias} d de atraso)` : ""}` : "";
  const situacao = atraso ? "Atrasada" : STATUS_ITEM_LABEL[it.status];
  const extra: string[] = [];
  if (it.origem) extra.push(`(vem da reunião nº ${it.origem.reuniaoNumero})`);
  if (it.transferidaPara) extra.push(`(passou para a reunião nº ${it.transferidaPara.reuniaoNumero})`);
  if (it.status === "concluida" && it.concluidoEm) extra.push(`(concluída em ${dataBr(it.concluidoEm.slice(0, 10))}${it.concluidoPor ? ` por ${it.concluidoPor}` : ""})`);
  const desc = [it.descricao, ...extra, it.observacao ? `Obs.: ${it.observacao}` : ""].filter(Boolean).join("\n");
  return {
    celulas: [
      ...(comReuniao ? [`nº ${comReuniao.numero} · ${dataBr(comReuniao.data)}`] : [TIPO_LABEL[it.tipo]]),
      desc,
      it.responsaveis.join(", "),
      prazo,
      situacao,
    ],
    destaque: atraso ? ("atraso" as const) : it.status === "concluida" ? ("ok" as const) : undefined,
  };
}

export async function gerarPdfDaAta(d: DadosDoPdf): Promise<{ blob: Blob; nome: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const r = d.reuniao;
  const logo = d.logo !== undefined ? d.logo : await logoComoDataUrl();
  const p = new Pagina(doc);

  // Participantes
  p.secao(`Participantes (${r.participantes.filter((x) => x.presente).length} presentes de ${r.participantes.length})`);
  if (r.participantes.length === 0) p.texto("Nenhum participante registrado.", { cor: COR.suave });
  else
    p.tabela(
      [{ titulo: "Nome", largura: 6 }, { titulo: "Função / empresa", largura: 5 }, { titulo: "Presença", largura: 2.5 }],
      r.participantes.map((x) => ({ celulas: [x.nome + (x.externo ? " (externo)" : ""), x.funcao, x.presente ? "Presente" : "Ausente"], destaque: x.presente ? undefined : ("atraso" as const) })),
    );

  // Pauta
  if (r.pauta.trim()) {
    p.secao("Pauta");
    p.texto(r.pauta, { espaco: 1 });
  }

  // Acompanhamento da reunião anterior
  if (d.anterior && d.anterior.itens.some((i) => i.tipo !== "informe")) {
    p.secao(`Acompanhamento da reunião anterior (nº ${d.anterior.numero}, ${dataBr(d.anterior.data)})`);
    p.tabela(
      [{ titulo: "Tipo", largura: 1.8 }, { titulo: "Item", largura: 6.5 }, { titulo: "Responsáveis", largura: 3 }, { titulo: "Prazo", largura: 2.4 }, { titulo: "Situação", largura: 2.6 }],
      d.anterior.itens.filter((i) => i.tipo !== "informe").map((i) => linhaDoItem(i, d.hoje)),
    );
  }

  // Definido nesta reunião
  const resumo = resumirReuniao(r, d.hoje);
  p.secao("Decisões e ações definidas nesta reunião");
  if (r.itens.length === 0) p.texto("Nenhum item registrado.", { cor: COR.suave });
  else {
    p.texto(
      `${resumo.decisoes} decisão(ões) · ${resumo.acoes} ação(ões) (${resumo.concluidas} concluída(s), ${resumo.emAberto} em aberto${resumo.atrasadas ? `, ${resumo.atrasadas} atrasada(s)` : ""}) · ${resumo.informes} informe(s)`,
      { tam: 9, cor: COR.suave, espaco: 1.5 },
    );
    p.tabela(
      [{ titulo: "Tipo", largura: 1.8 }, { titulo: "Descrição", largura: 6.5 }, { titulo: "Responsáveis", largura: 3 }, { titulo: "Prazo", largura: 2.4 }, { titulo: "Situação", largura: 2.6 }],
      r.itens.map((i) => linhaDoItem(i, d.hoje)),
    );
  }

  // Pendências
  p.secao("Pendências em aberto ao final desta reunião");
  if (d.pendencias.length === 0) p.texto("Nenhuma ação pendente.", { cor: COR.suave });
  else
    p.tabela(
      [{ titulo: "Reunião", largura: 2.4 }, { titulo: "Ação", largura: 6 }, { titulo: "Responsáveis", largura: 3 }, { titulo: "Prazo", largura: 2.4 }, { titulo: "Situação", largura: 2.4 }],
      d.pendencias.map((x) => linhaDoItem(x.item, d.hoje, x.reuniao)),
    );

  if (r.observacoes.trim()) {
    p.secao("Observações gerais");
    p.texto(r.observacoes, { espaco: 1 });
  }

  // Assinaturas
  p.garantir(40);
  p.y += 14;
  const colW = LARGURA / 2 - 6;
  doc.setDrawColor(...COR.texto).setLineWidth(0.3);
  doc.line(M.x, p.y, M.x + colW, p.y);
  doc.line(M.x + colW + 12, p.y, M.x + LARGURA, p.y);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...COR.suave);
  doc.text(paraLatin1(`Redator: ${r.redator || r.criadaPor}`), M.x, p.y + 4);
  doc.text("Coordenação / responsável pela qualidade", M.x + colW + 12, p.y + 4);

  // Cabeçalho e rodapé padrão Suporte em todas as páginas (a folha x / y só se sabe agora).
  const total = doc.getNumberOfPages();
  const presentes = r.participantes.filter((x) => x.presente).length;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    desenharCabecalho(doc, logo, r, i, total, presentes);
    desenharRodape(doc, r, d.geradoPor);
  }

  return { blob: doc.output("blob"), nome: nomeDoArquivoDaAta(r) };
}

export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
