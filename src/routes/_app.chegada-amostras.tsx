import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Package2, MoreHorizontal, GripVertical, Plus, Image as ImageIcon, X, Trash2, ChevronsUpDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
import { MultiSelect, Option } from "@/components/ui/multi-select";

export const Route = createFileRoute("/_app/chegada-amostras")({
  component: ChegadaAmostras,
});

type ColumnId = "registro" | "recebimento" | "abrir-os" | "os-sistema";

interface Task {
  id: string;
  osCliente: string;
  dataChegada: string;
  recebidoPor: string[];
  tipoAmostra: string[];
  relacaoAmostras: string;
  sup: string;
  priority: "baixa" | "media" | "alta";
  images: string[];
}

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "registro", title: "Registro" },
  { id: "recebimento", title: "Recebimento" },
  { id: "abrir-os", title: "Abrir OS" },
  { id: "os-sistema", title: "OS no sistema" },
];

const INITIAL_TASKS: Record<ColumnId, Task[]> = {
  registro: [
    { 
      id: "1", 
      osCliente: "Alfa / OS 1029", 
      dataChegada: "05/08/2026", 
      recebidoPor: ["Rafael Hereman"],
      tipoAmostra: ["DEF.1"],
      relacaoAmostras: "5 sacos de solo argiloso",
      sup: "CONTRATO-001",
      priority: "alta",
      images: []
    },
  ],
  recebimento: [],
  "abrir-os": [],
  "os-sistema": [],
};

function ChegadaAmostras() {
  const [tasks, setTasks] = useState<Record<ColumnId, Task[]>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chegada_amostras_tasks");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error parsing saved tasks:", e);
        }
      }
    }
    return INITIAL_TASKS;
  });

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chegada_amostras_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnId | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>([
    { label: "Rafael Hereman", value: "Rafael Hereman" },
    { label: "Renan Guerra", value: "Renan Guerra" },
    { label: "Renan Adriano", value: "Renan Adriano" },
    { label: "Rodrigo Silva", value: "Rodrigo Silva" },
    { label: "Murilo Freitas", value: "Murilo Freitas" },
    { label: "Thiago Araújo", value: "Thiago Araújo" },
  ]);

  const [tipoAmostraOptions, setTipoAmostraOptions] = useState<Option[]>([
    { label: "DEF.1", value: "DEF.1" },
    { label: "DEF.5", value: "DEF.5" },
    { label: "DEF.20", value: "DEF.20" },
    { label: "DEF.60", value: "DEF.60" },
    { label: "BL.30", value: "BL.30" },
    { label: "BL.40", value: "BL.40" },
    { label: "SH.3", value: "SH.3" },
    { label: "SH.4", value: "SH.4" },
    { label: "DN.3", value: "DN.3" },
    { label: "DN.4", value: "DN.4" },
  ]);

  // Form state
  const [formData, setFormData] = useState({
    osCliente: "",
    dataChegada: new Date().toLocaleDateString("pt-BR"),
    recebidoPor: [] as string[],
    tipoAmostra: [] as string[],
    relacaoAmostras: "",
    sup: "",
    priority: "media" as "baixa" | "media" | "alta",
    images: [] as string[]
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnd = (result: any) => {
    const { destination, source } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceCol = source.droppableId as ColumnId;
    const destCol = destination.droppableId as ColumnId;

    setTasks(prev => {
      const sourceTasks = Array.from(prev[sourceCol]);
      const destTasks = sourceCol === destCol ? sourceTasks : Array.from(prev[destCol]);
      
      const [movedTask] = sourceTasks.splice(source.index, 1);
      
      // Update task priority if moving between columns? No, just keep the task.
      // But we need to ensure "alta" priority is always at the top of the column.
      destTasks.splice(destination.index, 0, movedTask);

      // Re-sort all columns to keep 'alta' priority at the top
      const newTasks = { ...prev };
      newTasks[sourceCol] = sourceTasks.sort((a, b) => {
        if (a.priority === 'alta' && b.priority !== 'alta') return -1;
        if (a.priority !== 'alta' && b.priority === 'alta') return 1;
        return 0;
      });
      newTasks[destCol] = destTasks.sort((a, b) => {
        if (a.priority === 'alta' && b.priority !== 'alta') return -1;
        if (a.priority !== 'alta' && b.priority === 'alta') return 1;
        return 0;
      });

      return newTasks;
    });
  };

  const openCreateDialog = (colId: ColumnId) => {
    setActiveColumn(colId);
    setFormData({
      osCliente: "",
      dataChegada: new Date().toLocaleDateString("pt-BR"),
      recebidoPor: [],
      tipoAmostra: [],
      relacaoAmostras: "",
      sup: "",
      priority: "media",
      images: []
    });
    setSelectedTask(null);
    setIsCreateDialogOpen(true);
  };

  const saveTask = () => {
    if (selectedTask) {
      // Editing existing task
      setTasks(prev => {
        const newTasks = { ...prev };
        for (const colId in newTasks) {
          const col = colId as ColumnId;
          const index = newTasks[col].findIndex(t => t.id === selectedTask.id);
          if (index !== -1) {
            newTasks[col][index] = {
              ...newTasks[col][index],
              ...formData
            };
            // Re-sort the column after update
            newTasks[col] = newTasks[col].sort((a, b) => {
              if (a.priority === 'alta' && b.priority !== 'alta') return -1;
              if (a.priority !== 'alta' && b.priority === 'alta') return 1;
              return 0;
            });
            break;
          }
        }
        return newTasks;
      });
    } else {
      // Creating new task
      if (!activeColumn || !formData.osCliente) return;

      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        ...formData
      };

      setTasks(prev => ({
        ...prev,
        [activeColumn]: [newTask, ...prev[activeColumn]].sort((a, b) => {
          if (a.priority === 'alta' && b.priority !== 'alta') return -1;
          if (a.priority !== 'alta' && b.priority === 'alta') return 1;
          return 0;
        })
      }));
    }

    setIsCreateDialogOpen(false);
  };

  const deleteTask = (taskId: string) => {
    setTasks(prev => {
      const newTasks = { ...prev };
      for (const colId in newTasks) {
        const col = colId as ColumnId;
        newTasks[col] = newTasks[col].filter(t => t.id !== taskId);
      }
      return newTasks;
    });
    setIsCreateDialogOpen(false);
    setIsDetailsDialogOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, base64String]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const openDetails = (task: Task) => {
    setSelectedTask(task);
    setIsDetailsDialogOpen(true);
  };

  const openEditDialog = (task: Task, e: React.MouseEvent) => {
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
      images: task.images
    });
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="space-y-6 w-full pb-10">
      <PageHeader
        eyebrow="Laboratório · Logística"
        icon={Package2}
        title="Chegada de amostras"
        description="Controle o fluxo de entrada de materiais, do registro inicial até o lançamento no sistema."
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-250px)] min-h-[600px]">
          {COLUMNS.map((column) => (
            <div key={column.id} className="flex-1 min-w-[300px] flex flex-col gap-3 bg-muted/30 rounded-lg p-3">
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
                            className={`shadow-sm group hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                              task.priority === 'alta' ? 'border-l-red-500' : 
                              task.priority === 'media' ? 'border-l-amber-500' : 
                              'border-l-blue-500'
                            } ${snapshot.isDragging ? 'opacity-70 rotate-2' : ''}`}
                          >
                            <CardHeader className="p-3 pb-1 flex-row items-start justify-between space-y-0">
                              <div className="flex flex-col gap-1 overflow-hidden">
                                <Badge 
                                  variant="outline" 
                                  className={`text-[9px] uppercase tracking-wider w-fit h-4 px-1 ${
                                    task.priority === 'alta' ? 'text-red-500 border-red-500/20 bg-red-500/5' : 
                                    task.priority === 'media' ? 'text-amber-500 border-amber-500/20 bg-amber-500/5' : 
                                    'text-blue-500 border-blue-500/20 bg-blue-500/5'
                                  }`}
                                >
                                  {task.priority}
                                </Badge>
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
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => openEditDialog(task, e)}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                                <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                              </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-1 space-y-2">
                              {task.sup && (
                                <Badge variant="outline" className="text-[8px] border-primary/20 bg-primary/5 text-primary">
                                  SUP: {task.sup}
                                </Badge>
                              )}
                              {task.tipoAmostra.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {task.tipoAmostra.map(t => (
                                    <Badge key={t} variant="secondary" className="text-[8px] h-3 px-1 leading-none">
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
                              {task.images.length > 0 && (
                                <div className="flex gap-1 pt-1">
                                  {task.images.slice(0, 3).map((img, i) => (
                                    <div key={i} className="h-6 w-6 rounded bg-muted overflow-hidden border">
                                      <img src={img} alt="" className="h-full w-full object-cover" />
                                    </div>
                                  ))}
                                  {task.images.length > 3 && (
                                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-[8px] font-bold border">
                                      +{task.images.length - 3}
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
                        <p className="text-[10px] font-medium uppercase tracking-tight">Arraste ou crie aqui</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Dialog de Criação */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedTask ? "Editar Registro" : "Novo Registro de Amostra"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="osCliente" className="text-right text-xs">OS / Cliente</Label>
              <Input 
                id="osCliente" 
                value={formData.osCliente}
                onChange={e => setFormData(prev => ({ ...prev, osCliente: e.target.value }))}
                className="col-span-3 h-8" 
                placeholder="Ex: Alfa / OS 1234"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Tipo de Amostra</Label>
              <div className="col-span-3">
                <MultiSelect 
                  options={tipoAmostraOptions}
                  selected={formData.tipoAmostra}
                  onChange={val => setFormData(prev => ({ ...prev, tipoAmostra: val }))}
                  onCreateOption={(newOpt) => setTipoAmostraOptions(prev => [...prev, { label: newOpt, value: newOpt }])}
                  placeholder="Selecione os tipos..."
                  className="text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Recebido por</Label>
              <div className="col-span-3">
                <MultiSelect 
                  options={recebidoOptions}
                  selected={formData.recebidoPor}
                  onChange={val => setFormData(prev => ({ ...prev, recebidoPor: val }))}
                  onCreateOption={(newOpt) => setRecebidoOptions(prev => [...prev, { label: newOpt, value: newOpt }])}
                  placeholder="Selecione quem recebeu..."
                  className="text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="data" className="text-right text-xs">Data Chegada</Label>
              <Input 
                id="data" 
                value={formData.dataChegada}
                onChange={e => setFormData(prev => ({ ...prev, dataChegada: e.target.value }))}
                className="col-span-3 h-8"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sup" className="text-right text-xs">SUP</Label>
              <Input 
                id="sup" 
                value={formData.sup}
                onChange={e => setFormData(prev => ({ ...prev, sup: e.target.value }))}
                className="col-span-3 h-8"
                placeholder="Registro de contrato financeiro"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="relacao" className="text-right text-xs pt-2">Relação</Label>
              <Textarea 
                id="relacao" 
                value={formData.relacaoAmostras}
                onChange={e => setFormData(prev => ({ ...prev, relacaoAmostras: e.target.value }))}
                className="col-span-3 min-h-[80px] text-xs" 
                placeholder="Liste as amostras recebidas..."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right text-xs">Prioridade</Label>
              <div className="col-span-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-normal">
                      <span className="capitalize">{formData.priority}</span>
                      <ChevronsUpDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[340px]">
                    <DropdownMenuItem onClick={() => setFormData(prev => ({ ...prev, priority: "baixa" }))}>Baixa</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFormData(prev => ({ ...prev, priority: "media" }))}>Média</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFormData(prev => ({ ...prev, priority: "alta" }))}>Alta</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right text-xs pt-1">Imagens</Label>
              <div className="col-span-3 flex flex-wrap gap-2">
                {formData.images.map((img, i) => (
                  <div key={i} className="relative h-16 w-16 rounded border bg-muted group">
                    <img src={img} alt="" className="h-full w-full object-cover rounded" />
                    <button 
                      onClick={() => removeImage(i)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded border-2 border-dashed border-muted flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-[8px] font-bold mt-1">ADD</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handleImageUpload} 
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <div className="flex gap-2">
              {selectedTask && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Tem certeza que deseja excluir este card?")) {
                      deleteTask(selectedTask.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveTask}>{selectedTask ? "Salvar Alterações" : "Salvar Registro"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Detalhes */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        {selectedTask && (
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge 
                  variant="outline" 
                  className={`text-[10px] uppercase tracking-widest px-2 ${
                    selectedTask.priority === 'alta' ? 'text-red-500 border-red-500/20' : 
                    selectedTask.priority === 'media' ? 'text-amber-500 border-amber-500/20' : 
                    'text-blue-500 border-blue-500/20'
                  }`}
                >
                  Prioridade {selectedTask.priority}
                </Badge>
                <span className="text-xs text-muted-foreground">ID: {selectedTask.id}</span>
              </div>
              <DialogTitle className="text-2xl font-bold">{selectedTask.osCliente}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo de Amostra</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.tipoAmostra.map(t => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recebido por</h4>
                  <p className="text-sm font-medium">{selectedTask.recebidoPor.join(", ")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SUP</h4>
                  <p className="text-sm font-medium">{selectedTask.sup || "Não informado"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Data de Chegada</h4>
                  <p className="text-sm font-medium">{selectedTask.dataChegada}</p>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Relação das Amostras</h4>
                <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedTask.relacaoAmostras}
                </div>
              </div>
              
              {selectedTask.images.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ImageIcon className="h-3 w-3" />
                    Registros Fotográficos
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedTask.images.map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg border overflow-hidden bg-muted group relative">
                        <img src={img} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        <a 
                          href={img} 
                          target="_blank" 
                          rel="noreferrer"
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-[10px] text-white font-bold">VER ORIGINAL</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="sm:justify-between">
              <div className="text-[10px] text-muted-foreground flex items-center italic">
                Amostra registrada no fluxo logístico do laboratório.
              </div>
              <Button onClick={() => setIsDetailsDialogOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}