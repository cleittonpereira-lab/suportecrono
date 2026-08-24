import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import {
  Package2,
  MoreHorizontal,
  Plus,
  Trash2,
  ChevronsUpDown,
  UserPlus,
  Tag,
  PackagePlus,
  Calendar,
  User,
  Clock,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  Smartphone,
  Layers,
  Sparkles,
  AlertTriangle,
  FolderPlus,
  Kanban,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  getStoredColumns,
  saveStoredColumns,
  createChegadaColumn,
  deleteChegadaColumn,
  getStoredTasks,
  saveStoredTasks,
  getTipoAmostraOptions,
  addTipoAmostraOption,
  getRecebidoOptions,
  addRecebidoOption,
  formatDateToday,
  formatNow,
  useChegadaRealtimeSync,
  CHEGADA_UPDATE_EVENT,
  CHEGADA_COLUMNS_EVENT,
  CHEGADA_OPTIONS_EVENT,
  type ColumnId,
  type ChegadaColumn,
  type ChegadaTask,
  type Option,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { ChegadaImageGallery } from "@/components/chegada/ChegadaImageGallery";

export const Route = createFileRoute("/_app/chegada-amostras")({
  head: () => ({
    meta: [
      { title: "Chegada de Amostras — Suporte INFRA" },
      { name: "description", content: "Fluxo de entrada e triagem de amostras no laboratório." },
    ],
  }),
  component: ChegadaAmostras,
});

function ChegadaAmostras() {
  const { displayName, user, profile, role } = useAuth();
  const currentUserName =
    displayName || profile?.nome || user?.email?.split("@")[0] || "Administrador";

  // Estados principais com persistência local e sincronização em nuvem
  const [columns, setColumns] = useState<ChegadaColumn[]>(() => getStoredColumns());
  const [tasks, setTasks] = useState<Record<string, ChegadaTask[]>>(() => getStoredTasks());
  const [tipoAmostraOptions, setTipoAmostraOptions] = useState<Option[]>(() => getTipoAmostraOptions());
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>(() => getRecebidoOptions());

  // Sincronização em tempo real entre múltiplos dispositivos
  useChegadaRealtimeSync(setTasks, setColumns);

  // Modais de Tarefas
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ChegadaTask | null>(null);

  // Modais de Colunas (Criação e Exclusão)
  const [isCreateColumnDialogOpen, setIsCreateColumnDialogOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColSubtitle, setNewColSubtitle] = useState("");

  const [columnToDelete, setColumnToDelete] = useState<ChegadaColumn | null>(null);
  const [isDeleteColumnDialogOpen, setIsDeleteColumnDialogOpen] = useState(false);

  // Utilitários de link
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyMobileLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const directUrl = `${origin}/registro-amostra`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(directUrl);
      setCopiedLink(true);
      toast.success("Link do celular copiado com sucesso!", {
        description: directUrl,
      });
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  // Form state de Tarefas
  const [formData, setFormData] = useState({
    osCliente: "",
    dataChegada: formatDateToday(),
    recebidoPor: [] as string[],
    tipoAmostra: [] as string[],
    relacaoAmostras: "",
    sup: "",
    priority: "media" as "baixa" | "media" | "alta",
    images: [] as string[],
  });

  // Re-sync local events
  useEffect(() => {
    const handleTasksUpdate = () => setTasks(getStoredTasks());
    const handleColumnsUpdate = () => setColumns(getStoredColumns());
    const handleOptionsUpdate = () => {
      setTipoAmostraOptions(getTipoAmostraOptions());
      setRecebidoOptions(getRecebidoOptions());
    };

    window.addEventListener(CHEGADA_UPDATE_EVENT, handleTasksUpdate);
    window.addEventListener(CHEGADA_COLUMNS_EVENT, handleColumnsUpdate);
    window.addEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
    return () => {
      window.removeEventListener(CHEGADA_UPDATE_EVENT, handleTasksUpdate);
      window.removeEventListener(CHEGADA_COLUMNS_EVENT, handleColumnsUpdate);
      window.removeEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
    };
  }, []);

  const handleAddTipoOption = (newOpt: string) => {
    const updated = addTipoAmostraOption(newOpt);
    setTipoAmostraOptions(updated);
    toast.success(`Tipo de amostra "${newOpt}" cadastrado com sucesso!`);
  };

  const handleAddRecebidoOption = (newOpt: string) => {
    const updated = addRecebidoOption(newOpt);
    setRecebidoOptions(updated);
    toast.success(`Responsável "${newOpt}" cadastrado com sucesso!`);
  };

  // Drag and Drop
  const handleDragEnd = (result: any) => {
    const { destination, source } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceCol = source.droppableId;
    const destCol = destination.droppableId;

    const sourceTasks = Array.from(tasks[sourceCol] || []);
    const destTasks = sourceCol === destCol ? sourceTasks : Array.from(tasks[destCol] || []);

    const [movedTask] = sourceTasks.splice(source.index, 1);
    if (!movedTask) return;

    destTasks.splice(destination.index, 0, movedTask);

    // Re-sort das colunas mantendo alta prioridade em evidência
    const newTasks = { ...tasks };
    newTasks[sourceCol] = sourceTasks.sort((a, b) => {
      if (a.priority === "alta" && b.priority !== "alta") return -1;
      if (a.priority !== "alta" && b.priority === "alta") return 1;
      return 0;
    });
    newTasks[destCol] = destTasks.sort((a, b) => {
      if (a.priority === "alta" && b.priority !== "alta") return -1;
      if (a.priority !== "alta" && b.priority === "alta") return 1;
      return 0;
    });

    setTasks(newTasks);
    saveStoredTasks(newTasks, columns);
  };

  // Gerenciamento de Cards
  const openCreateDialog = (colId: string) => {
    setActiveColumn(colId);
    setFormData({
      osCliente: "",
      dataChegada: formatDateToday(),
      recebidoPor: [],
      tipoAmostra: [],
      relacaoAmostras: "",
      sup: "",
      priority: "media",
      images: [],
    });
    setSelectedTask(null);
    setIsCreateDialogOpen(true);
  };

  const saveTask = () => {
    if (!formData.osCliente.trim()) {
      toast.error("Por favor, preencha o campo OS / Cliente.");
      return;
    }
    if (formData.tipoAmostra.length === 0) {
      toast.error("Selecione ao menos um Tipo de Amostra.");
      return;
    }
    if (formData.recebidoPor.length === 0) {
      toast.error("Selecione quem recebeu as amostras.");
      return;
    }

    if (selectedTask) {
      // Editando task existente
      const newTasks = { ...tasks };
      for (const colId in newTasks) {
        const index = newTasks[colId].findIndex((t) => t.id === selectedTask.id);
        if (index !== -1) {
          newTasks[colId][index] = {
            ...newTasks[colId][index],
            ...formData,
            updatedAt: formatNow(),
          };
          newTasks[colId] = newTasks[colId].sort((a, b) => {
            if (a.priority === "alta" && b.priority !== "alta") return -1;
            if (a.priority !== "alta" && b.priority === "alta") return 1;
            return 0;
          });
          break;
        }
      }
      setTasks(newTasks);
      saveStoredTasks(newTasks, columns);
      toast.success("Registro atualizado com sucesso!");
    } else {
      // Criando nova task
      if (!activeColumn) return;

      const newTask: ChegadaTask = {
        id: "amostra_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
        ...formData,
        criadoPor: currentUserName,
        criadoEm: formatNow(),
        origem: "administrador",
        updatedAt: formatNow(),
      };

      const newTasks = {
        ...tasks,
        [activeColumn]: [newTask, ...(tasks[activeColumn] || [])].sort((a, b) => {
          if (a.priority === "alta" && b.priority !== "alta") return -1;
          if (a.priority !== "alta" && b.priority === "alta") return 1;
          return 0;
        }),
      };

      setTasks(newTasks);
      saveStoredTasks(newTasks, columns);
      toast.success("Novo registro adicionado com sucesso!");
    }

    setIsCreateDialogOpen(false);
  };

  const deleteTask = (taskId: string) => {
    const newTasks = { ...tasks };
    for (const colId in newTasks) {
      newTasks[colId] = newTasks[colId].filter((t) => t.id !== taskId);
    }
    setTasks(newTasks);
    saveStoredTasks(newTasks, columns);
    setIsCreateDialogOpen(false);
    setIsDetailsDialogOpen(false);
    toast.info("Card de amostra excluído.");
  };

  const openDetails = (task: ChegadaTask) => {
    setSelectedTask(task);
    setIsDetailsDialogOpen(true);
  };

  const openEditDialog = (task: ChegadaTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTask(task);
    setFormData({
      osCliente: task.osCliente,
      dataChegada: task.dataChegada,
      recebidoPor: task.recebidoPor,
      tipoAmostra: task.tipoAmostra,
      relacaoAmostras: task.relacaoAmostras,
      sup: task.sup || "",
      priority: task.priority,
      images: task.images || [],
    });
    setIsCreateDialogOpen(true);
  };

  // Gerenciamento de Colunas
  const handleCreateColumn = () => {
    if (!newColTitle.trim()) {
      toast.error("Informe o título da nova coluna.");
      return;
    }
    const created = createChegadaColumn(newColTitle, newColSubtitle);
    setColumns((prev) => [...prev, created]);
    setTasks((prev) => ({ ...prev, [created.id]: [] }));
    setNewColTitle("");
    setNewColSubtitle("");
    setIsCreateColumnDialogOpen(false);
    toast.success(`Coluna "${created.title}" criada com sucesso!`);
  };

  const handleOpenDeleteColumnDialog = (column: ChegadaColumn, e: React.MouseEvent) => {
    e.stopPropagation();
    if (column.isSystem || column.id === "registro") {
      toast.warning("A coluna 'Registro' é a entrada principal do sistema e não pode ser excluída.");
      return;
    }
    setColumnToDelete(column);
    setIsDeleteColumnDialogOpen(true);
  };

  const handleConfirmDeleteColumn = () => {
    if (!columnToDelete) return;
    const deleted = deleteChegadaColumn(columnToDelete.id);
    if (deleted) {
      setColumns((prev) => prev.filter((c) => c.id !== columnToDelete.id));
      const { [columnToDelete.id]: _, ...remainingTasks } = tasks;
      setTasks(remainingTasks);
      toast.success(`Coluna "${columnToDelete.title}" excluída com sucesso.`);
    }
    setColumnToDelete(null);
    setIsDeleteColumnDialogOpen(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full pb-10">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <PageHeader
          eyebrow="Laboratório · Logística"
          icon={Package2}
          title="Chegada de amostras"
          description="Controle o fluxo de entrada de materiais, do registro inicial até o lançamento no sistema."
        />

        {/* Ações Rápidas: Criar Coluna, Copiar Link Celular & Novo Registro */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsCreateColumnDialogOpen(true)}
            className="gap-1.5 text-xs h-9 shadow-2xs font-semibold"
          >
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>+ Nova Coluna</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyMobileLink}
            className="gap-1.5 text-xs h-9 shadow-2xs font-medium"
            title="Copiar link direto para envio aos colaboradores no celular"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Copiar Link p/ Celular</span>
                <span className="sm:hidden">Link Celular</span>
              </>
            )}
          </Button>

          <Button
            asChild
            className="gap-2 text-xs font-bold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 h-9"
          >
            <Link to="/registro-amostra">
              <PackagePlus className="h-4 w-4" />
              <span>+ Registro de Colaborador</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Esteira Kanban Responsiva com Drag-and-Drop e Colunas Dinâmicas */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3.5 overflow-x-auto pb-4 custom-scrollbar items-start min-h-[calc(100vh-230px)]">
          {columns.map((column) => {
            const columnTasks = tasks[column.id] || [];
            return (
              <div
                key={column.id}
                className="w-[290px] sm:w-[320px] md:w-[340px] shrink-0 flex flex-col gap-2.5 bg-muted/30 rounded-xl p-3 border border-border/70 shadow-2xs transition-all"
              >
                {/* Header da Coluna */}
                <div className="flex items-start justify-between gap-2 px-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs sm:text-sm text-foreground truncate">
                        {column.title}
                      </h3>
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-bold bg-background/80 text-foreground border shadow-2xs"
                      >
                        {columnTasks.length}
                      </Badge>
                    </div>
                    {column.subtitle && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {column.subtitle}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
                      onClick={() => openCreateDialog(column.id)}
                      title={`Novo registro em ${column.title}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>

                    {!column.isSystem && column.id !== "registro" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem
                            onClick={(e) => handleOpenDeleteColumnDialog(column, e)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Excluir coluna</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Área Droppable das Tarefas */}
                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="flex flex-col gap-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-300px)] min-h-[140px] pr-1 custom-scrollbar"
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => openDetails(task)}
                              className={`shadow-2xs group hover:shadow-md transition-all cursor-pointer border-l-4 ${
                                task.priority === "alta"
                                  ? "border-l-destructive bg-destructive/[0.02]"
                                  : task.priority === "media"
                                  ? "border-l-amber-500 bg-amber-500/[0.02]"
                                  : "border-l-emerald-500 bg-emerald-500/[0.02]"
                              } ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/40 rotate-1" : ""}`}
                            >
                              <CardContent className="p-3 space-y-2 text-xs">
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-bold text-foreground text-xs leading-tight line-clamp-1">
                                    {task.osCliente}
                                  </span>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge
                                      variant={task.priority === "alta" ? "destructive" : "secondary"}
                                      className={cn(
                                        "text-[9px] h-4 px-1 uppercase font-semibold tracking-wider",
                                        task.priority === "media" && "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                      )}
                                    >
                                      {task.priority}
                                    </Badge>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity p-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="text-xs">
                                        <DropdownMenuItem onClick={() => openDetails(task)}>
                                          Ver detalhes
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => openEditDialog(task, e)}>
                                          Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTask(task.id);
                                          }}
                                        >
                                          Excluir
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {task.sup && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] h-4 font-normal bg-muted/30 text-muted-foreground border-border/60"
                                  >
                                    SUP: {task.sup}
                                  </Badge>
                                )}

                                {task.tipoAmostra.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {task.tipoAmostra.map((t) => (
                                      <Badge
                                        key={t}
                                        variant="secondary"
                                        className="text-[9px] h-4 px-1.5 font-medium leading-none bg-primary/10 text-primary border border-primary/20"
                                      >
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                                  "{task.relacaoAmostras}"
                                </p>

                                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1.5 border-t border-border/50">
                                  <span className="font-medium truncate max-w-[130px]">
                                    {task.recebidoPor.join(", ")}
                                  </span>
                                  <span>{task.dataChegada}</span>
                                </div>

                                {/* Miniaturas compactas das fotos anexadas */}
                                {task.images && task.images.length > 0 && (
                                  <div className="flex gap-1.5 pt-1">
                                    {task.images.slice(0, 4).map((img, i) => (
                                      <div
                                        key={i}
                                        className="h-7 w-7 rounded bg-muted overflow-hidden border border-border shadow-2xs"
                                      >
                                        <img
                                          src={img}
                                          alt=""
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      </div>
                                    ))}
                                    {task.images.length > 4 && (
                                      <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-[9px] font-bold border border-border text-muted-foreground">
                                        +{task.images.length - 4}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {columnTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-border/60 rounded-lg opacity-50 bg-background/30">
                          <p className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                            Arraste ou crie aqui
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}

          {/* Card Botão para Adicionar Nova Coluna no final do Quadro */}
          <div
            onClick={() => setIsCreateColumnDialogOpen(true)}
            className="w-[200px] sm:w-[240px] shrink-0 border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-primary/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all text-muted-foreground hover:text-primary min-h-[140px]"
          >
            <div className="p-2 rounded-full bg-background border shadow-2xs">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div className="text-center">
              <span className="text-xs font-bold block">+ Nova Coluna</span>
              <span className="text-[10px] text-muted-foreground">Adicionar nova etapa ao fluxo</span>
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Dialog de Criação / Edição de Card de Amostra */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              {selectedTask ? "Editar Registro de Amostra" : "Novo Registro de Amostra"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="osCliente" className="text-xs font-semibold">
                OS / Cliente <span className="text-destructive">*</span>
              </Label>
              <Input
                id="osCliente"
                value={formData.osCliente}
                onChange={(e) => setFormData((prev) => ({ ...prev, osCliente: e.target.value }))}
                className="h-9 text-xs bg-background"
                placeholder="Ex: Alfa / OS 1234"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Tipo de Amostra *</span>
                </Label>
                <ChegadaMultiSelect
                  options={tipoAmostraOptions}
                  selected={formData.tipoAmostra}
                  onChange={(val) => setFormData((prev) => ({ ...prev, tipoAmostra: val }))}
                  placeholder="Selecione os tipos..."
                  searchPlaceholder="Filtrar tipos..."
                  createButtonLabel="+ Novo Tipo de Amostra"
                  createInputPlaceholder="Nome do novo tipo..."
                  onAddOption={handleAddTipoOption}
                  icon="tag"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Recebido por *</span>
                </Label>
                <ChegadaMultiSelect
                  options={recebidoOptions}
                  selected={formData.recebidoPor}
                  onChange={(val) => setFormData((prev) => ({ ...prev, recebidoPor: val }))}
                  placeholder="Selecione quem recebeu..."
                  searchPlaceholder="Filtrar responsáveis..."
                  createButtonLabel="+ Novo Responsável"
                  createInputPlaceholder="Nome do colaborador..."
                  onAddOption={handleAddRecebidoOption}
                  icon="user"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="data" className="text-xs font-semibold">
                  Data de Chegada *
                </Label>
                <Input
                  id="data"
                  value={formData.dataChegada}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dataChegada: e.target.value }))}
                  className="h-9 text-xs bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sup" className="text-xs font-semibold">
                  Registro de Contrato / SUP
                </Label>
                <Input
                  id="sup"
                  value={formData.sup}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sup: e.target.value }))}
                  className="h-9 text-xs bg-background"
                  placeholder="Ex: SUP-2026-9812"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relacao" className="text-xs font-semibold">
                Relação das Amostras *
              </Label>
              <Textarea
                id="relacao"
                value={formData.relacaoAmostras}
                onChange={(e) => setFormData((prev) => ({ ...prev, relacaoAmostras: e.target.value }))}
                className="min-h-[80px] text-xs bg-background leading-relaxed"
                placeholder="Liste as amostras recebidas..."
                required
              />
            </div>

            {/* Prioridade */}
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-xs font-semibold">
                Prioridade
              </Label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as any }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>

            {/* Fotos */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-semibold">Registros Fotográficos</Label>
              <ChegadaImageGallery
                images={formData.images}
                onChange={(imgs) => setFormData((prev) => ({ ...prev, images: imgs }))}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveTask}
              className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Salvar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Nova Coluna */}
      <Dialog open={isCreateColumnDialogOpen} onOpenChange={setIsCreateColumnDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-primary" />
              Adicionar Nova Coluna
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="colTitle" className="text-xs font-semibold">
                Nome da Coluna <span className="text-destructive">*</span>
              </Label>
              <Input
                id="colTitle"
                value={newColTitle}
                onChange={(e) => setNewColTitle(e.target.value)}
                placeholder="Ex: Triagem, Pendência Cliente, Arquivo..."
                className="h-9 text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="colSubtitle" className="text-xs font-semibold">
                Descrição / Subtítulo <span className="text-muted-foreground font-normal">(Opcional)</span>
              </Label>
              <Input
                id="colSubtitle"
                value={newColSubtitle}
                onChange={(e) => setNewColSubtitle(e.target.value)}
                placeholder="Ex: Amostras aguardando liberação"
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateColumnDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateColumn}
              disabled={!newColTitle.trim()}
              className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Criar Coluna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação para Excluir Coluna */}
      <AlertDialog open={isDeleteColumnDialogOpen} onOpenChange={setIsDeleteColumnDialogOpen}>
        <AlertDialogContent className="sm:max-w-[440px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="text-base font-bold">
                Excluir Coluna "{columnToDelete?.title}"?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs leading-relaxed pt-2">
              Esta ação removerá a coluna do quadro de Chegada de Amostras.
              {columnToDelete && tasks[columnToDelete.id]?.length > 0 && (
                <span className="block mt-2 font-semibold text-destructive">
                  Atenção: Existem {tasks[columnToDelete.id].length}{" "}
                  {tasks[columnToDelete.id].length === 1 ? "registro" : "registros"} nesta coluna que também serão removidos.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 border-t">
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteColumn}
              className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
            >
              Excluir Coluna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Detalhes da Amostra */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Ficha de Registro de Amostra
                </div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {selectedTask?.osCliente}
                </DialogTitle>
              </div>
              {selectedTask && (
                <Badge
                  variant={selectedTask.priority === "alta" ? "destructive" : "secondary"}
                  className={cn(
                    "uppercase text-[10px] font-bold px-2 py-0.5",
                    selectedTask.priority === "media" && "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                  )}
                >
                  Prioridade {selectedTask.priority}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4 py-2 text-xs">
              {/* Metadados de Auditoria */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/30 rounded-lg border border-border/70 text-[11px]">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Canal de Origem</span>
                  <span className="font-semibold text-foreground">
                    {selectedTask.origem === "colaborador" ? "📱 Tela do Colaborador" : "💻 Área Administrativa"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Cadastrado por</span>
                  <span className="font-semibold text-foreground">
                    {selectedTask.criadoPor || "Colaborador"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Data e Hora</span>
                  <span className="font-semibold text-foreground">
                    {selectedTask.criadoEm || selectedTask.dataChegada}
                  </span>
                </div>
              </div>

              {/* Informações da Entrega */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 p-2.5 bg-background rounded-md border">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    Tipos de Amostra
                  </span>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {selectedTask.tipoAmostra.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px] bg-primary/10 text-primary border border-primary/20"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 p-2.5 bg-background rounded-md border">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    Recebido por
                  </span>
                  <span className="font-medium text-foreground">
                    {selectedTask.recebidoPor.join(", ")}
                  </span>
                </div>
              </div>

              {selectedTask.sup && (
                <div className="p-2.5 bg-background rounded-md border">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    Contrato / SUP
                  </span>
                  <span className="font-medium text-foreground">{selectedTask.sup}</span>
                </div>
              )}

              <div className="p-3 bg-background rounded-md border space-y-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  Relação das Amostras
                </span>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedTask.relacaoAmostras}
                </p>
              </div>

              {/* Fotos Anexadas */}
              {selectedTask.images && selectedTask.images.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <span className="text-xs font-semibold block">
                    Fotos Anexadas ({selectedTask.images.length})
                  </span>
                  <ChegadaImageGallery images={selectedTask.images} readOnly />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex justify-between items-center sm:justify-between pt-3 border-t">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => selectedTask && deleteTask(selectedTask.id)}
              className="text-xs gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDetailsDialogOpen(false)}
                className="text-xs"
              >
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={(e) => selectedTask && openEditDialog(selectedTask, e)}
                className="text-xs font-semibold"
                variant="secondary"
              >
                Editar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  if (!selectedTask) return;
                  try {
                    const { labStore } = await import("@/features/lab/store");
                    const parts = selectedTask.osCliente.split("/");
                    const client = parts[0]?.trim() || selectedTask.osCliente;
                    const num = parts[1]?.trim().replace(/^OS[-\s]*/i, "") || selectedTask.osCliente;

                    const newOs = labStore.createOS({
                      numero: num,
                      client,
                      workNumber: selectedTask.sup || "",
                      operator: selectedTask.recebidoPor.join(", "),
                      revision: "00",
                    });

                    labStore.createAmostra(newOs.id, {
                      code: "AM-01",
                      description: selectedTask.relacaoAmostras,
                      reportNumber: "01",
                    });

                    // Move o card para a coluna "os-sistema" se existir
                    const targetCol = columns.find((c) => c.id === "os-sistema" || c.title.toLowerCase().includes("sistema"))?.id || "os-sistema";
                    const newTasks = { ...tasks };
                    for (const k in newTasks) {
                      newTasks[k] = newTasks[k].filter((t) => t.id !== selectedTask.id);
                    }
                    if (!newTasks[targetCol]) newTasks[targetCol] = [];
                    newTasks[targetCol].unshift(selectedTask);
                    setTasks(newTasks);
                    saveStoredTasks(newTasks, columns);

                    setIsDetailsDialogOpen(false);
                    toast.success(`OS ${num} criada com sucesso no sistema do laboratório!`, {
                      description: "Acesse a aba 'Ordens de serviço' para visualizar.",
                    });
                  } catch (err: any) {
                    toast.error("Erro ao criar OS: " + err?.message);
                  }
                }}
                className="text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Lançar OS no Sistema</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}