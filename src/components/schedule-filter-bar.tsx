import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuCheckboxItem, 
  DropdownMenuContent, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Search, X, ChevronDown } from "lucide-react";
import {
  emptyFilters,
  uniqueSorted,
  splitSetores,
  ESCOPO_TAGS,
  type ScheduleFilters,
} from "@/lib/schedule-utils";
import type { ScheduleRow } from "@/lib/sheets.functions";

interface Props {
  rows: ScheduleRow[];
  filters: ScheduleFilters;
  onChange: (f: ScheduleFilters) => void;
  filteredCount?: number;
  totalCount?: number;
}

export function ScheduleFilterBar({
  rows,
  filters,
  onChange,
  filteredCount,
  totalCount,
}: Props) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParam = new URLSearchParams(window.location.search).get("search");
      if (searchParam && searchParam !== filters.search) {
        onChange({ ...filters, search: searchParam });
        // Clean URL after consuming
        const url = new URL(window.location.href);
        url.searchParams.delete("search");
        window.history.replaceState(null, "", url);
      }
    }
  }, []);

  const setores = uniqueSorted(rows.flatMap((r) => splitSetores(r.setor)));
  const tomadores = uniqueSorted(rows.map((r) => r.tomador));

  const hasActive =
    !!filters.search.trim() ||
    filters.setor !== "all" ||
    filters.tomador !== "all" ||
    filters.status !== "all" ||
    (filters.escopo && filters.escopo.length > 0);

  return (
    <div className="mb-4 grid grid-cols-1 md:grid-cols-12 gap-3">
      <div className="relative md:col-span-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por OS, tomador, setor, laboratório..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-10"
        />
      </div>
      <div className="md:col-span-3">
        <Select
          value={filters.setor}
          onValueChange={(v) => onChange({ ...filters, setor: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {setores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal h-10 px-3">
              <span className="truncate">
                {filters.escopo && filters.escopo.length > 0 
                  ? `${filters.escopo.length} selecionado(s)` 
                  : "Todos os escopos"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Filtrar por Escopo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ESCOPO_TAGS.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={filters.escopo?.includes(t)}
                onCheckedChange={(checked) => {
                  const current = filters.escopo || [];
                  const next = checked 
                    ? [...current, t] 
                    : current.filter(x => x !== t);
                  onChange({ ...filters, escopo: next });
                }}
              >
                {t}
              </DropdownMenuCheckboxItem>
            ))}
            {filters.escopo && filters.escopo.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <Button 
                  variant="ghost" 
                  className="w-full justify-center h-8 text-xs" 
                  onClick={() => onChange({ ...filters, escopo: [] })}
                >
                  Limpar escopos
                </Button>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="md:col-span-3">
        <Select
          value={filters.tomador}
          onValueChange={(v) => onChange({ ...filters, tomador: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tomador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tomadores</SelectItem>
            {tomadores.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="atrasado">Atrasados</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="futuro">Futuros</SelectItem>
            <SelectItem value="pendente">Sem data</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {hasActive && (
        <div className="md:col-span-12 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filteredCount ?? 0} de {totalCount ?? 0} resultados
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...emptyFilters })}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}