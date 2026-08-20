import React, { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, X, Search, UserPlus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const listRef = useRef<HTMLDivElement>(null);
  const newOptionInputRef = useRef<HTMLInputElement>(null);

  // Garante que o input receba foco ao abrir o modo de criação
  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => {
        if (newOptionInputRef.current) {
          newOptionInputRef.current.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

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

  const handleSaveNewOption = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const clean = newOptionName.trim();
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

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-[36px] py-1.5 px-3 text-left font-normal bg-background hover:bg-muted/30 border border-input shadow-2xs transition-all",
            className
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
                  <span className="truncate max-w-[150px]">{item}</span>
                  <button
                    type="button"
                    className="rounded-full hover:bg-primary/20 p-0.5 text-primary/70 hover:text-primary transition-colors"
                    onClick={(e) => handleUnselect(e, item)}
                    title={`Remover ${item}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] sm:w-[360px] p-0 shadow-lg border rounded-lg z-[100] bg-popover text-popover-foreground pointer-events-auto"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          // Permite foco interativo interno
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
        onFocusOutside={(e) => {
          // Impede o dialog pai de sequestrar o foco do Popover
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          // Permite fechar se clicar fora do dropdown
        }}
        onWheel={(e) => {
          // Isola a rolagem da lista sem repassar para o modal pai
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col max-h-[380px] overflow-hidden">
          {/* Header de Busca Fixo */}
          <div className="p-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={searchPlaceholder}
              className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 bg-transparent"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>

          {/* Lista de Opções com Rolagem Suave Garantida */}
          <div
            ref={listRef}
            className="overflow-y-auto max-h-[220px] p-1 divide-y divide-border/30 custom-scrollbar"
            style={{
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
            onWheel={(e) => {
              e.stopPropagation();
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
              <div className="py-5 text-center text-xs text-muted-foreground">
                Nenhuma opção encontrada para "{searchQuery}"
              </div>
            )}
          </div>

          {/* Rodapé Fixo: Criação de Nova Opção Inline */}
          {onAddOption && (
            <div className="p-2 border-t bg-muted/30 shrink-0">
              {isCreating ? (
                <form
                  onSubmit={handleSaveNewOption}
                  className="flex flex-col gap-2 p-2 bg-background rounded-md border shadow-xs"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                    Cadastrar novo item
                  </div>
                  <Input
                    ref={newOptionInputRef}
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveNewOption();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsCreating(false);
                      }
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder={createInputPlaceholder}
                    className="h-8 text-xs bg-background focus:ring-1 focus:ring-primary"
                    autoComplete="off"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1.5 pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={(e) => {
                        e.stopPropagation();
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveNewOption();
                      }}
                      disabled={!newOptionName.trim()}
                    >
                      Salvar
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 h-8 gap-1.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
