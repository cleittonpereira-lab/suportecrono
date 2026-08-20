import React, { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, X, Search, UserPlus, Tag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface Option {
  label: string;
  value: string;
}

interface ChegadaMultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  createButtonLabel?: string; // e.g. "+ Novo Tipo de Amostra" or "+ Novo Responsável"
  createInputPlaceholder?: string;
  onAddOption?: (newOption: string) => void;
  className?: string;
  icon?: "user" | "tag";
}

export function ChegadaMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selecione...",
  searchPlaceholder = "Procurar...",
  createButtonLabel = "+ Novo Item",
  createInputPlaceholder = "Nome do novo item...",
  onAddOption,
  className,
  icon,
}: ChegadaMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newOptionInputRef = useRef<HTMLInputElement>(null);

  // Fecha o dropdown ao clicar fora do container
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsCreating(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Foca o input de criação quando ativado
  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => {
        if (newOptionInputRef.current) {
          newOptionInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  // Foca a busca ao abrir o dropdown
  useEffect(() => {
    if (open && !isCreating) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, isCreating]);

  const handleUnselect = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    onChange(selected.filter((i) => i !== item));
  };

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSaveNewOption = (customName?: string) => {
    const clean = (customName || newOptionName).trim();
    if (!clean) return;

    if (onAddOption) {
      onAddOption(clean);
    }
    if (!selected.includes(clean)) {
      onChange([...selected, clean]);
    }
    setNewOptionName("");
    setIsCreating(false);
    setSearchQuery("");
  };

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return options.some((opt) => opt.value.toLowerCase() === q || opt.label.toLowerCase() === q);
  }, [options, searchQuery]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Gatilho / Campo Visual */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between min-h-[36px] py-1.5 px-3 text-left font-normal bg-background hover:bg-muted/30 border border-input rounded-md shadow-2xs transition-all focus:outline-none focus:ring-1 focus:ring-primary",
          open && "ring-1 ring-primary border-primary"
        )}
      >
        <div className="flex flex-wrap gap-1.5 items-center flex-1 overflow-hidden pr-2">
          {selected.length > 0 ? (
            selected.map((item) => (
              <Badge
                key={item}
                variant="secondary"
                className="rounded-md px-2 py-0.5 font-medium text-[11px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors flex items-center gap-1"
              >
                <span className="truncate max-w-[140px]">{item}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded-full hover:bg-primary/20 p-0.5 text-primary/70 hover:text-primary transition-colors cursor-pointer"
                  onClick={(e) => handleUnselect(e, item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleUnselect(e as any, item);
                    }
                  }}
                  title={`Remover ${item}`}
                >
                  <X className="h-3 w-3" />
                </span>
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground text-xs">{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1 text-muted-foreground" />
      </button>

      {/* Painel Dropdown Ancorado no Próprio Container (Zero Conflito com FocusTrap do Modal) */}
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] w-full min-w-[300px] max-w-[420px] bg-popover text-popover-foreground border border-border shadow-xl rounded-lg z-[9999] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ maxHeight: "380px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header de Busca Fixo */}
          <div className="p-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !exactMatchExists && searchQuery.trim()) {
                  e.preventDefault();
                  handleSaveNewOption(searchQuery.trim());
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="flex-1 h-8 text-xs bg-transparent border-0 outline-none px-1 text-foreground placeholder:text-muted-foreground"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Atalho Rápido de Criação quando busca não existe */}
          {!exactMatchExists && searchQuery.trim() && (
            <div
              onClick={() => handleSaveNewOption(searchQuery.trim())}
              className="px-3 py-2 bg-primary/10 hover:bg-primary/20 border-b border-primary/20 text-primary text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>Adicionar: <strong>"{searchQuery.trim()}"</strong></span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background text-primary border-primary/30 shrink-0">
                Pressione Enter
              </Badge>
            </div>
          )}

          {/* Lista de Opções com Rolagem Suave */}
          <div
            ref={listRef}
            className="overflow-y-auto max-h-[200px] p-1 divide-y divide-border/30 custom-scrollbar"
            style={{
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-2 rounded-md text-xs cursor-pointer select-none transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40 bg-background"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
                      </div>
                      <span className="truncate">{opt.label}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Nenhuma opção encontrada para "{searchQuery}"
              </div>
            )}
          </div>

          {/* Rodapé Fixo: Criação de Novo Item */}
          {onAddOption && (
            <div className="p-2 border-t bg-muted/30 shrink-0">
              {isCreating ? (
                <div className="flex flex-col gap-2 p-2 bg-background rounded-md border shadow-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cadastrar novo item
                  </div>
                  <input
                    ref={newOptionInputRef}
                    type="text"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveNewOption();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsCreating(false);
                      }
                    }}
                    placeholder={createInputPlaceholder}
                    className="h-8 text-xs bg-background border border-input rounded px-2.5 outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground w-full"
                    autoComplete="off"
                  />
                  <div className="flex items-center justify-end gap-1.5 pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        setIsCreating(false);
                        setNewOptionName("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs px-3 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleSaveNewOption()}
                      disabled={!newOptionName.trim()}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full flex items-center justify-start text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 h-8 px-2.5 rounded transition-colors gap-1.5"
                  onClick={() => {
                    setIsCreating(true);
                    if (searchQuery.trim() && !options.some(o => o.value.toLowerCase() === searchQuery.toLowerCase())) {
                      setNewOptionName(searchQuery.trim());
                    }
                  }}
                >
                  {icon === "user" ? (
                    <UserPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <span>{createButtonLabel}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
