"use client";

import { Download, LoaderCircle, OctagonAlert, Play } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { AddImagesDialog } from "@/components/project-page/add-images-dialog";
import { ShareDialog } from "@/components/project-page/share-dialog";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/toolbar/toolbar";
import {
  useGetProject,
  useGetProjectResults,
  useGetSocket,
} from "@/lib/queries/projects";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { use, useEffect, useLayoutEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSession } from "@/providers/session-provider";
import {
  useDownloadProject,
  useDownloadProjectResults,
  useProcessProject,
} from "@/lib/mutations/projects";
import { useToast } from "@/hooks/use-toast";
import { ProjectImage } from "@/lib/projects";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Transition } from "@headlessui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGetSharedProject } from "@/lib/queries/share";
import { api } from "@/lib/axios";

import JSZip from "jszip";
import axios from "axios";
import { useGetSharedResults } from "@/lib/queries/share-results";

export default function Project({ params }: { params: Promise<{ pid: string }> }) {
  // --- ESTADO & HOOKS ---
  const [shareToken, setShareToken] = useState("");

  useEffect(() => {
    setShareToken(sessionStorage.getItem("share_token") || "");
  }, []);

  const isShare = !!shareToken;

  const resolvedParams = use(params);
  const session = useSession();
  const { pid } = resolvedParams;
  const sharedProject = useGetSharedProject(shareToken);
  const uid = isShare ? "" : (session?.user?._id ?? "");
  const jwt = isShare ? "" : (session?.token ?? "");
  const authedProject = useGetProject(uid, pid, jwt);
  const project = shareToken ? sharedProject : authedProject;
  const downloadProjectImages = useDownloadProject();
  const processProject = useProcessProject();
  const downloadProjectResults = useDownloadProjectResults();
  const { toast } = useToast();
  const socket = useGetSocket(shareToken ? "" : jwt);
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();
  const path = usePathname();
  const sidebar = useSidebar();
  const isMobile = useIsMobile();
  
  // Estados de Interface
  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingSteps, setProcessingSteps] = useState<number>(1);
  const [waitingForPreview, setWaitingForPreview] = useState<string>("");
  
  // Novo Estado de Cancelamento
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  const sharedResults = useGetSharedResults(shareToken);

  const sharePermission =
    (project.data as any)?.share?.permission ??
    (sessionStorage.getItem("share_permission") || "READ");

  const isReadOnly = isShare && sharePermission !== "EDIT";

  const totalProcessingSteps =
    (project.data?.tools.length ?? 0) * (project.data?.imgs.length ?? 0);
  
  const projectResults = useGetProjectResults(
    shareToken ? "" : uid,
    pid,
    shareToken ? "" : jwt,
  );
  
  const qc = useQueryClient();

  // --- EFEITOS ---

  useLayoutEffect(() => {
    if (
      !["edit", "results"].includes(mode) ||
      !["grid", "carousel"].includes(view)
    ) {
      router.replace(path);
    }
  }, [mode, view, path, router, projectResults.data]);

  useEffect(() => {
    function onProcessUpdate() {
      // Se o utilizador já cancelou, ignoramos qualquer mensagem que chegue atrasada do servidor
      if (isCancelled) return;

      setProcessingSteps((prev) => {
        const nextStep = prev + 1;
        const progress = Math.min(Math.round((nextStep * 100) / totalProcessingSteps), 100);
        setProcessingProgress(progress);
        
        // Se completou
        if (nextStep >= totalProcessingSteps) {
           // Pequeno delay para UX
           setTimeout(() => {
             if (!isCancelled) { // Verificação dupla
               projectResults.refetch().then(() => {
                 setProcessing(false);
                 setProcessingProgress(0);
                 setProcessingSteps(1);
                 if (!isMobile) sidebar.setOpen(true);
                 router.push(`?mode=results&view=${view}`); // Mantém a view atual
               });
             }
           }, 1000);
        }
        return nextStep;
      });
    }

    let active = true;

    if (active && socket.data && !isCancelled) {
      socket.data.on("process-update", () => {
        if (active && !isCancelled) onProcessUpdate();
      });
    }

    return () => {
      active = false;
      if (socket.data) socket.data.off("process-update", onProcessUpdate);
    };
  }, [
    pid,
    processingSteps,
    qc,
    router,
    session.token,
    session.user._id,
    socket.data,
    totalProcessingSteps,
    sidebar,
    isMobile,
    projectResults,
    isCancelled,
    view
  ]);

  // --- RENDERIZAÇÃO DE ERROS/LOADING ---

  if (project.isError)
    return (
      <div className="flex size-full justify-center items-center h-screen p-8">
        <Alert
          variant="destructive"
          className="w-fit max-w-[40rem] text-wrap truncate"
        >
          <OctagonAlert className="size-4" />
          <AlertTitle>{project.error.name}</AlertTitle>
          <AlertDescription>{project.error.message}</AlertDescription>
        </Alert>
      </div>
    );

  if (project.isLoading || !project.data)
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );

  if (!isShare && (projectResults.isLoading || !projectResults.data))
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );

  // --- RENDERIZAÇÃO PRINCIPAL ---

  return (
    <ProjectProvider
      project={project.data}
      currentImage={currentImage}
      preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}
    >
      <div className="flex flex-col h-screen relative">
        {/* Header */}
        <div className="flex flex-col xl:flex-row justify-center items-start xl:items-center xl:justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 h-fit gap-2">
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <h1 className="text-lg font-semibold truncate">
              {project.data.name}
            </h1>
            <div className="flex items-center gap-2 xl:hidden">
              <ViewToggle />
              <ModeToggle />
            </div>
          </div>
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <SidebarTrigger variant="outline" className="h-9 w-10 lg:hidden" />
            <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
              
                <>
                  <Button
                    disabled={
                      isReadOnly || project.data.tools.length <= 0 || waitingForPreview !== ""
                    }
                    className="inline-flex"
                    onClick={async () => {
                      if (isReadOnly) return;

                      try {
                        // Reset de estados antes de iniciar
                        setIsCancelled(false);
                        setProcessingSteps(1);
                        setProcessingProgress(0);

                        if (isShare) {
                          await api.post(`/share/project/${shareToken}/process`);
                          setProcessing(true);
                          sidebar.setOpen(false);
                        } else {
                          processProject.mutate(
                            { uid: session.user._id, pid: project.data._id, token: session.token },
                            {
                              onSuccess: () => {
                                setProcessing(true);
                                sidebar.setOpen(false);
                              },
                              onError: (error) =>
                                toast({
                                  title: "Ups! An error occurred.",
                                  description: error.message,
                                  variant: "destructive",
                                }),
                            },
                          );
                        }
                      } catch (e: any) {
                        toast({
                          title: "Ups! An error occurred.",
                          description: e?.message ?? "Erro ao processar",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Play /> Apply
                  </Button>
                  {!isShare && <ShareDialog />}
                  {!isShare && <AddImagesDialog />}
                </>
              
              
              <Button
                variant="outline"
                className="px-3"
                title="Download project"
                onClick={async () => {
                  try {
                    // ---------------- SHARE ----------------
                    if (isShare) {
                      if (!project.data) throw new Error("Shared project not loaded");

                      const zip = new JSZip();

                      if (mode === "edit") {
                        for (const image of project.data.imgs) {
                          const resp = await axios.get(image.url, { responseType: "arraybuffer" });
                          zip.file(image.name, resp.data);
                        }

                        const blob = await zip.generateAsync({ type: "blob" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${project.data.name}.zip`;
                        a.click();
                        return;
                      }

                      // mode === "results"
                      const results = sharedResults.data; 
                      if (!results) throw new Error("No results yet");

                      const all = [
                        ...(results.imgs ?? []).map((x: any) => ({ name: x.name, url: x.url })),
                        ...(results.texts ?? []).map((x: any) => ({ name: x.name, url: x.url })),
                      ];

                      for (const r of all) {
                        const resp = await axios.get(r.url, { responseType: "arraybuffer" });
                        zip.file(r.name, resp.data);
                      }

                      const blob = await zip.generateAsync({ type: "blob" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `${project.data.name}_results.zip`;
                      a.click();
                      return;
                    }

                    // ---------------- NORMAL ----------------
                    (mode === "edit" ? downloadProjectImages : downloadProjectResults).mutate({
                      uid: session.user._id,
                      pid: project.data._id,
                      token: session.token,
                      projectName: project.data.name,
                    });
                  } catch (e: any) {
                    toast({
                      title: "Ups! An error occurred.",
                      description: e?.message ?? "Erro ao fazer download",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {(mode === "edit"
                  ? downloadProjectImages
                  : downloadProjectResults
                ).isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download />
                )}
              </Button>
              <div className="hidden xl:flex items-center gap-2">
                <ViewToggle />
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>
        {/* Main Content */}
        <div className="h-full overflow-x-hidden flex">
          {mode !== "results" && <Toolbar readOnly={isReadOnly}/>}
          <ProjectImageList
            setCurrentImageId={setCurrentImage}
            results={isShare ? (sharedResults.data ?? { imgs: [], texts: [] }) : (projectResults.data ?? { imgs: [], texts: [] })}
          />
        </div>
      </div>
      
      {/* OVERLAY DE PROCESSAMENTO */}
      <Transition
        show={processing}
        enter="transition-opacity ease-in duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity ease-out duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="absolute top-0 left-0 h-screen w-screen bg-black/70 z-50 flex justify-center items-center">
          <Card className="p-4 flex flex-col justify-center items-center gap-4">
            <div className="flex gap-2 items-center text-lg font-semibold">
              <h1>Processing</h1>
              <LoaderCircle className="size-[1em] animate-spin" />
            </div>
            <Progress value={processingProgress} className="w-96" />
            
            {/* BOTÃO CANCELAR IMPLEMENTADO AQUI */}
            {!isShare && (
            <Button 
              variant="destructive" 
              onClick={async () => {
                // 1. Feedback Imediato (Optimistic UI)
                setIsCancelled(true); // Bloqueia updates do socket
                setProcessing(false); // Fecha o modal
                setProcessingProgress(0);
                setProcessingSteps(1);
                
                toast({ title: "Canceling...", description: "Stopping the pipeline." });

                try {
                  // 2. Pedido ao Backend (Silencioso)
                  await api.post(
                    `/projects/${session.user._id}/${pid}/cancel`,
                    {},
                    { headers: { Authorization: `Bearer ${session.token}` } }
                  );
                  toast({ title: "Cancelled", description: "Processing stopped successfully." });
                } catch (error) {
                  // Mesmo que o backend falhe, para o utilizador já "parou".
                  console.error("Cancel failed on server", error);
                } finally {
                  // Reset da flag para permitir futuros processamentos (segurança)
                  setTimeout(() => setIsCancelled(false), 1000);
                }
              }}
            >
              Cancel
            </Button>)}
          </Card>
        </div>
      </Transition>
    </ProjectProvider>
  );
}

