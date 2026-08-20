import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import {
  Package2,
  MoreHorizontal,
  GripVertical,
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
} from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  COLUMNS,
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
  CHEGADA_OPTIONS_EVENT,
  type ColumnId,
  type ChegadaTask,
  type Option,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { ChegadaImageGallery } from "@/components/chegada/ChegadaImageGallery";

export const Route = createFileRoute("/_app/chegada-amostras")({
  component: ChegadaAmostras,
});

function ChegadaAmostras() {
  const { displayName, user, profile, role } = useAuth();
  const currentUserName =
    displayName || profile?.nome || user?.email?.split("@")[0] || "Administrador";
  const isAdmin = role === "admin" || role === "gestor";

  const [tasks, setTasks] = useState<Record<ColumnId, ChegadaTask[]>>(() => getStoredTasks());
  const [tipoAmostraOptions, setTipoAmostraOptions] = useState<Option[]>(() => getTipoAmostraOptions());
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>(() => getRecebidoOptions());

  // Ativa sincronização em tempo real entre todos os aparelhos
  useChegadaRealtimeSync(setTasks);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnId | null>(null);
  const [selectedTask, setSelectedTask] = useState<ChegadaTask | null>(null);
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

  // Form state
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

  // Re-sync tasks and options whenever changed locally or across tabs
  useEffect(() => {
    const handleTasksUpdate = () => {
      setTasks(getStoredTasks());
    };
    const handleOptionsUpdate = () => {
      setTipoAmostraOptions(getTipoAmostraOptions());
      setRecebidoOptions(getRecebidoOptions());
    };

    window.addEventListener(CHEGADA_UPDATE_EVENT, handleTasksUpdate);
    window.addEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
    window.addEventListener("storage", handleTasksUpdate);

    return () => {
      window.removeEventListener(CHEGADA_UPDATE_EVENT, handleTasksUpdate);
      window.removeEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
      window.removeEventListener("storage", handleTasksUpdate);
    };
  }, []);

  const handleDragEnd = (result: any) => {
    const { destination, source } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceCol = source.droppableId as ColumnId;
    const destCol = destination.droppableId as ColumnId;

    const sourceTasks = Array.from(tasks[sourceCol]);
    const destTasks = sourceCol === destCol ? sourceTasks : Array.from(tasks[destCol]);

    const [movedTask] = sourceTasks.splice(source.index, 1);
    destTasks.splice(destination.index, 0, movedTask);

    // Re-sort all columns to keep 'alta' priority at the top
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
    saveStoredTasks(newTasks);
  };

  const openCreateDialog = (colId: ColumnId) => {
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
      // Editing existing task
      const newTasks = { ...tasks };
      for (const colId in newTasks) {
        const col = colId as ColumnId;
        const index = newTasks[col].findIndex((t) => t.id === selectedTask.id);
        if (index !== -1) {
          newTasks[col][index] = {
            ...newTasks[col][index],
            ...formData,
            updatedAt: formatNow(),
          };
          // Re-sort the column after update
          newTasks[col] = newTasks[col].sort((a, b) => {
            if (a.priority === "alta" && b.priority !== "alta") return -1;
            if (a.priority !== "alta" && b.priority === "alta") return 1;
            return 0;
          });
          break;
        }
      }
      setTasks(newTasks);
      saveStoredTasks(newTasks);
      toast.success("Registro atualizado com sucesso!");
    } else {
      // Creating new task
      if (!activeColumn) return;

      const newTask: ChegadaTask = {
        id: Math.random().toString(36).substring(2, 9),
        ...formData,
        criadoPor: currentUserName,
        criadoEm: formatNow(),
        origem: "administrador",
        updatedAt: formatNow(),
      };

      const newTasks = {
        ...tasks,
        [activeColumn]: [newTask, ...tasks[activeColumn]].sort((a, b) => {
          if (a.priority === "alta" && b.priority !== "alta") return -1;
          if (a.priority !== "alta" && b.priority === "alta") return 1;
          return 0;
        }),
      };
      setTasks(newTasks);
      saveStoredTasks(newTasks);
      toast.success("Registro de amostra criado com sucesso!");
    }

    setIsCreateDialogOpen(false);
  };

  const deleteTask = (taskId: string) => {
    const newTasks = { ...tasks };
    for (const colId in newTasks) {
      const col = colId as ColumnId;
      newTasks[col] = newTasks[col].filter((t) => t.id !== taskId);
    }
    setTasks(newTasks);
    saveStoredTasks(newTasks);
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

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          eyebrow="Laboratório · Logística"
          icon={Package2}
          title="Chegada de amostras"
          description="Controle o fluxo de entrada de materiais, do registro inicial até o lançamento no sistema."
        />

        {/* Ações Rápidas: Copiar Link Celular & Novo Registro */}
        <div className="flex items-center gap-2 shrink-0">
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
                <span>Copiar Link p/ Celular</span>
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

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-250px)] min-h-[600px] custom-scrollbar">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className="flex-1 min-w-[300px] max-w-[380px] flex flex-col gap-3 bg-muted/30 rounded-lg p-3 border border-border/60"
            >
              <div className="flex items-center justify-between px-1 mb-1">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  {column.title}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold">
                    {tasks[column.id].length}
                  </Badge>
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => openCreateDialog(column.id)}
                  title={`Novo registro em ${column.title}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <Droppable droppableId={column.id}>
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-[100px]"
                  >
                    {tasks[column.id].map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => openDetails(task)}
                            className={`shadow-2xs group hover:shadow-md transition-all cursor-pointer border-l-4 ${
                              task.priority === "alta"
                                ? "border-l-red-500 bg-red-500/[0.02]"
                                : task.priority === "media"
                                ? "border-l-amber-500 bg-amber-500/[0.02]"
                                : "border-l-blue-500 bg-blue-500/[0.02]"
                            } ${snapshot.isDragging ? "opacity-70 rotate-2 shadow-xl" : ""}`}
                          >
                            <CardHeader className="p-3 pb-1 flex-row items-start justify-between space-y-0">
                              <div className="flex flex-col gap-1 overflow-hidden flex-1 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] uppercase tracking-wider w-fit h-4 px-1.5 font-bold ${
                                      task.priority === "alta"
                                        ? "text-red-600 border-red-500/30 bg-red-500/10"
                                        : task.priority === "media"
                                        ? "text-amber-600 border-amber-500/30 bg-amber-500/10"
                                        : "text-blue-600 border-blue-500/30 bg-blue-500/10"
                                    }`}
                                  >
                                    {task.priority}
                                  </Badge>

                                  {task.origem === "colaborador" && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[8px] h-4 px-1 font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                    >
                                      Colaborador
                                    </Badge>
                                  )}
                                </div>
                                <CardTitle className="text-sm font-bold leading-tight mt-1 truncate">
                                  {task.osCliente}
                                </CardTitle>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Tem certeza que deseja excluir este card?")) {
                                      deleteTask(task.id);
                                    }
                                  }}
                                  title="Excluir card"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => openEditDialog(task, e)}
                                  title="Editar registro"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                              </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-1 space-y-2">
                              {task.sup && (
                                <Badge
                                  variant="outline"
                                  className="text-[8px] border-primary/20 bg-primary/5 text-primary"
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
                                      className="text-[8px] h-4 px-1.5 font-medium leading-none"
                                    >
                                      {t}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                                "{task.relacaoAmostras}"
                              </p>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                                <span className="font-medium truncate max-w-[120px]">
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

                    {tasks[column.id].length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-muted rounded-lg opacity-40">
                        <p className="text-[10px] font-medium uppercase tracking-tight">
                          Arraste ou crie aqui
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Dialog de Criação / Edição */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle>
              {selectedTask ? "Editar Registro de Amostra" : "Novo Registro de Amostra"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-3 text-xs">
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

            {/* Prioridade (Visível para o Administrador) */}
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-xs font-semibold">
                Prioridade
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between h-9 text-xs font-normal bg-background"
                  >
                    <span className="capitalize font-medium">{formData.priority}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[300px] z-50">
                  <DropdownMenuItem onClick={() => setFormData((prev) => ({ ...prev, priority: "baixa" }))}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>Baixa</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData((prev) => ({ ...prev, priority: "media" }))}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Média</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData((prev) => ({ ...prev, priority: "alta" }))}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span>Alta</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Imagens (Câmera + Galeria + Lightbox) */}
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs font-semibold">Registros Fotográficos</Label>
              <ChegadaImageGallery
                images={formData.images}
                onChange={(imgs) => setFormData((prev) => ({ ...prev, images: imgs }))}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between pt-3 border-t">
            <div className="flex gap-2">
              {selectedTask && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                  onClick={() => {
                    if (confirm("Tem certeza que deseja excluir este card?")) {
                      deleteTask(selectedTask.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)} className="text-xs">
                Cancelar
              </Button>
              <Button size="sm" onClick={saveTask} className="text-xs font-bold bg-primary text-primary-foreground">
                {selectedTask ? "Salvar Alterações" : "Salvar Registro"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Detalhes da Amostra (Com Informações de Auditoria e Lightbox) */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        {selectedTask && (
          <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-widest px-2.5 font-bold ${
                    selectedTask.priority === "alta"
                      ? "text-red-500 border-red-500/20 bg-red-500/5"
                      : selectedTask.priority === "media"
                      ? "text-amber-500 border-amber-500/20 bg-amber-500/5"
                      : "text-blue-500 border-blue-500/20 bg-blue-500/5"
                  }`}
                >
                  Prioridade {selectedTask.priority}
                </Badge>

                {selectedTask.origem && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    Origem: {selectedTask.origem === "colaborador" ? "Tela do Colaborador" : "Administração"}
                  </Badge>
                )}

                <span className="text-xs text-muted-foreground ml-auto">ID: {selectedTask.id}</span>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-bold">{selectedTask.osCliente}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* Metadados Principais */}
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-3 rounded-lg border border-border/70">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Tipo de Amostra
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.tipoAmostra.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] font-medium">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Recebido por
                  </h4>
                  <p className="text-xs font-semibold text-foreground">{selectedTask.recebidoPor.join(", ")}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SUP / Contrato</h4>
                  <p className="text-xs font-medium text-foreground">{selectedTask.sup || "Não informado"}</p>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Data de Chegada
                  </h4>
                  <p className="text-xs font-medium text-foreground">{selectedTask.dataChegada}</p>
                </div>
              </div>

              {/* Relação das Amostras */}
              <div className="space-y-1 pt-2 border-t">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Relação das Amostras
                </h4>
                <div className="bg-muted/40 rounded-lg p-3 text-xs whitespace-pre-wrap leading-relaxed border border-border/60">
                  {selectedTask.relacaoAmostras}
                </div>
              </div>

              {/* Seção de Auditoria (Quem criou, quando e origem) */}
              <div className="space-y-1.5 pt-2 border-t">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Informações de Auditoria
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-muted/30 p-2.5 rounded-md border border-border/60 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Cadastrado por:</span>
                    <strong className="text-foreground font-semibold">
                      {selectedTask.criadoPor || "Colaborador"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Data/Hora de Criação:</span>
                    <strong className="text-foreground font-semibold">
                      {selectedTask.criadoEm || selectedTask.dataChegada}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Canal de Origem:</span>
                    <strong className="text-foreground font-semibold">
                      {selectedTask.origem === "colaborador" ? "Tela do Colaborador" : "Área Administrativa"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Registros Fotográficos com Lightbox */}
              {selectedTask.images && selectedTask.images.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Registros Fotográficos ({selectedTask.images.length})
                  </h4>
                  <ChegadaImageGallery images={selectedTask.images} readOnly />
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={(e) => {
                  setIsDetailsDialogOpen(false);
                  openEditDialog(selectedTask, e);
                }}
              >
                Editar Registro
              </Button>
              <Button size="sm" onClick={() => setIsDetailsDialogOpen(false)} className="text-xs">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}