/**
 * Mapa dos CPTu (Leaflet + OpenStreetMap). Um círculo por ponto, na cor do
 * status. O Leaflet é carregado só no navegador (ele mexe em `window`).
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { STATUS_LABEL, type CptuRegistro, type CptuStatus } from "./logic";

export const STATUS_COR: Record<CptuStatus, string> = {
  PENDENTE: "#f59e0b",
  PRIORIDADE: "#e11d48",
  EXECUTADO: "#0284c7",
  CONCLUIDO: "#059669",
  CANCELADO: "#71717a",
};

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function CptuMap({
  registros,
  selecionado,
  onSelecionar,
  className = "",
}: {
  registros: CptuRegistro[];
  selecionado?: string | null;
  onSelecionar?: (id: string) => void;
  className?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<Leaflet.Map | null>(null);
  const camadaRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const marcadoresRef = useRef(new Map<string, Leaflet.CircleMarker>());
  const pontosRef = useRef<[number, number][]>([]);
  const enquadrarPendente = useRef(false);
  const focoPendente = useRef<string | null>(null);
  const onSelRef = useRef(onSelecionar);
  onSelRef.current = onSelecionar;

  // Cria o mapa uma vez.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !divRef.current || mapaRef.current) return;
      LRef.current = L;
      const mapa = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView(
        [-23.5, -47.5],
        6,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
      // A roda do mouse só dá zoom depois de clicar no mapa — sem isso, rolar
      // a página por cima do mapa vira zoom sem querer.
      mapa.scrollWheelZoom.disable();
      mapa.on("click", () => mapa.scrollWheelZoom.enable());
      mapa.on("mouseout", () => mapa.scrollWheelZoom.disable());
      mapaRef.current = mapa;
      camadaRef.current = L.layerGroup().addTo(mapa);
      desenhar(true);
    })();
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
      camadaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function desenhar(enquadrar: boolean) {
    const L = LRef.current;
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!L || !mapa || !camada) return;
    camada.clearLayers();
    marcadoresRef.current.clear();
    const pontos: [number, number][] = [];
    for (const r of registros) {
      if (r.lat == null || r.lng == null) continue;
      pontos.push([r.lat, r.lng]);
      const m = L.circleMarker([r.lat, r.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 1.5,
        fillColor: STATUS_COR[r.status],
        fillOpacity: 0.95,
      });
      const prof = r.profundidade ? `${r.profundidade.toLocaleString("pt-BR")} m` : "—";
      m.bindPopup(
        `<div style="font-size:12px;line-height:1.45;min-width:180px">
          <div style="font-weight:600">${esc(r.identificacao)}</div>
          <div>OS ${esc(r.os)} · <span style="color:${STATUS_COR[r.status]};font-weight:600">${STATUS_LABEL[r.status]}</span></div>
          <div>Profundidade: ${prof}</div>
          ${r.obsCampo ? `<div style="color:#64748b;margin-top:2px">${esc(r.obsCampo)}</div>` : ""}
          <div style="margin-top:4px;display:flex;gap:8px">
            <a href="https://sond.com.br/servicos/os-numero/${encodeURIComponent(r.os)}" target="_blank" rel="noopener noreferrer">SOND</a>
            <a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener noreferrer">Google Maps</a>
          </div>
        </div>`,
      );
      m.bindTooltip(esc(r.identificacao), { direction: "top", offset: [0, -6] });
      m.on("click", () => onSelRef.current?.(r.id));
      m.addTo(camada);
      marcadoresRef.current.set(r.id, m);
    }
    pontosRef.current = pontos;
    if (enquadrar) enquadrarPontos();
  }

  // Escondido (aba inativa) o mapa tem tamanho zero e o enquadramento sai
  // errado — fica pendente até ele aparecer.
  const visivel = () => (divRef.current?.clientWidth ?? 0) > 0;
  function enquadrarPontos() {
    const mapa = mapaRef.current;
    if (!mapa || !pontosRef.current.length) return;
    if (!visivel()) {
      enquadrarPendente.current = true;
      return;
    }
    enquadrarPendente.current = false;
    mapa.fitBounds(pontosRef.current, { padding: [30, 30], maxZoom: 14 });
  }
  function focar(id: string) {
    const m = marcadoresRef.current.get(id);
    const mapa = mapaRef.current;
    if (!m || !mapa) return;
    if (!visivel()) {
      focoPendente.current = id;
      return;
    }
    focoPendente.current = null;
    mapa.setView(m.getLatLng(), Math.max(mapa.getZoom(), 13));
    m.openPopup();
  }

  // Redesenha quando a lista muda (filtros, status).
  const assinatura = registros.map((r) => `${r.id}:${r.status}:${r.lat}:${r.lng}`).join("|");
  const ultimaRef = useRef<string>("");
  useEffect(() => {
    const idsAntes = ultimaRef.current
      .split("|")
      .map((x) => x.split(":")[0])
      .join("|");
    const idsAgora = registros.map((r) => r.id).join("|");
    ultimaRef.current = assinatura;
    desenhar(idsAntes !== idsAgora);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  // Centraliza no selecionado (clicado na planilha).
  useEffect(() => {
    if (selecionado) focar(selecionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  // O mapa pode nascer numa aba escondida: recalcula o tamanho quando aparece
  // e faz o enquadramento/foco que ficou pendente.
  useEffect(() => {
    const el = divRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!mapaRef.current || !visivel()) return;
      mapaRef.current.invalidateSize();
      if (enquadrarPendente.current) enquadrarPontos();
      if (focoPendente.current) focar(focoPendente.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-lg border ${className}`}>
      <div ref={divRef} className="h-full w-full z-0" />
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-2 rounded-md bg-background/90 px-2 py-1 text-[11px] shadow">
        {(Object.keys(STATUS_COR) as CptuStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
