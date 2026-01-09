"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragEndEvent 
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from "@dnd-kit/sortable";

// --- As tuas ferramentas ---
import BrightnessTool from "./brightness-tool";
import ContrastTool from "./contrast-tool";
import CropTool from "./crop-tool";
import ResizeTool from "./resize-tool";
import RotateTool from "./rotate-tool";
import SaturationTool from "./saturation-tool";
import BorderTool from "./border-tool";
import BinarizationTool from "./binarization-tool";
import WatermarkTool from "./watermark-tool";
import CropAITool from "./ai-crop-tool";
import BgRemovalAITool from "./ai-bg-removal";
import ObjectAITool from "./object-ai-tool";
import PeopleAITool from "./people-ai-tool";
import TextAITool from "./text-ai-tool";
import UpgradeAITool from "./upgrade-ai-tool";

// --- Imports de Sistema ---
import { useClearProjectTools } from "@/lib/mutations/projects";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo } from "@/providers/project-provider"; 
import { api } from "@/lib/axios"; 
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Eraser, Layers } from "lucide-react";
import { SortableTool } from "./sortable-tool"; // O ficheiro que criaste no Passo 1
import { useToast } from "@/hooks/use-toast";

export function Toolbar({ readOnly = false }: { readOnly?: boolean }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const disabled = view === "grid";
  
  const project = useProjectInfo();
  const session = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState<boolean>(false);

  const uid = session?.user?._id ?? "";
  const jwt = session?.token ?? "";


  const clearTools = useClearProjectTools(uid, project._id, jwt);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- O CÉREBRO DO DRAG & DROP ---
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!uid || !jwt) {
    toast({
      variant: "destructive",
      title: "Sem sessão",
      description: "Para reordenar precisas de login.",
    });
    return;
  }
    const { active, over } = event;

    if (active.id !== over?.id && project.tools) {
      const oldIndex = project.tools.findIndex((t) => t._id === active.id);
      const newIndex = project.tools.findIndex((t) => t._id === over?.id);

      // Reordenar visualmente
      const newTools = arrayMove(project.tools, oldIndex, newIndex).map((tool, index) => ({
        ...tool,
        position: index
      }));
      
      // Atualizar UI imediatamente (Hack visual)
      project.tools = newTools; 
      
      // Enviar para o Backend (Gatilho T-06)
      try {
        await api.post(
          `/projects/${uid}/${project._id}/reorder`, 
          newTools,
          { headers: { Authorization: `Bearer ${jwt}` } }
        );
        toast({ title: "Pipeline Updated", description: "Processing started..." });
      } catch (error) {
        console.error("Reorder failed", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to reorder." });
      }
    }
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      
      {/* --- ZONA 1: PIPELINE (ARRASTAR AQUI) --- */}
      <div className="flex flex-col flex-1 h-1/2 bg-gray-50/50 dark:bg-black/20">
        <div className="p-4 pb-2 border-b">
          <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
            <Layers className="w-4 h-4" /> Pipeline Ativo
          </h2>
        </div>

        <ScrollArea className="flex-1 px-3 py-3">
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={readOnly ? undefined : handleDragEnd}
          >
            <SortableContext 
              items={project.tools.map((t) => t._id)} 
              strategy={verticalListSortingStrategy}
            >
              {project.tools.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm text-center p-4">
                  <p>Ainda sem ferramentas.</p>
                  <p className="text-xs mt-1">Adiciona ferramentas em baixo.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {project.tools.map((tool) => (
                    <SortableTool key={tool._id} id={tool._id}>
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium capitalize text-sm">
                          {tool.procedure.replace(/_/g, " ")}
                        </span>
                      </div>
                    </SortableTool>
                  ))}
                </div>
              )}
            </SortableContext>
          </DndContext>
        </ScrollArea>

        <Separator />
      </div>

      {/* --- ZONA 2: ADICIONAR (CLICAR AQUI) --- */}
      <div className="h-auto bg-background p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Adicionar Efeito</span>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-500 h-6 px-2 text-xs"
                disabled={readOnly || project.tools.length === 0}
              >
                <Eraser className="w-3 h-3 mr-1" /> Limpar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Limpar tudo?</DialogTitle>
                <DialogDescription>Vai remover todas as edições.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={() => {

                    if (!uid || !jwt) {
                      toast({ variant: "destructive", title: "Sem sessão", description: "Não podes editar sem login." });
                      return;
                    }   

                    clearTools.mutate({
                      uid: uid,
                      pid: project._id,
                      toolIds: project.tools.map((t) => t._id),
                      token: jwt,
                    });
                    setOpen(false);
                  }}
                >
                  Limpar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {/* Botões originais */}
          <BrightnessTool disabled={disabled || readOnly} />
          <ContrastTool disabled={disabled || readOnly} />
          <SaturationTool disabled={disabled || readOnly} />
          <BinarizationTool disabled={disabled || readOnly} />
          <RotateTool disabled={disabled || readOnly} />
          <CropTool disabled={disabled || readOnly} />
          <ResizeTool disabled={disabled || readOnly} />
          <BorderTool disabled={disabled || readOnly} />
          <WatermarkTool disabled={disabled || readOnly} />
          <BgRemovalAITool disabled={disabled || readOnly} />
          <CropAITool disabled={disabled || readOnly} />
          <ObjectAITool disabled={disabled || readOnly} />
          <PeopleAITool disabled={disabled || readOnly} />
          <TextAITool disabled={disabled || readOnly} />
          <UpgradeAITool disabled={disabled || readOnly} />
        </div>
      </div>
    </div>
  );
}