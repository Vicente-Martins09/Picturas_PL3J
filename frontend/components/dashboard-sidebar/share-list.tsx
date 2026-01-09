"use client";

import { Copy, ExternalLink, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useGetProjectShares } from "@/lib/queries/share";
import { useRevokeShareLink } from "@/lib/mutations/share";
import { useSession } from "@/providers/session-provider";

export default function ShareLinksSection({ pid }: { pid: string }) {
  const session = useSession();
  const { toast } = useToast();

  const uid = session.user._id;
  const token = session.token;

  const shares = useGetProjectShares(uid, pid, token, session.user.type !== "anonymous");
  const revoke = useRevokeShareLink(uid, pid);

  async function handleCopy(url: string) {
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado." });
  }

  if (session.user.type === "anonymous") return null;

  return (
    <SidebarGroup className="mt-2">
      <SidebarGroupLabel className="flex items-center gap-2">
        <LinkIcon className="size-4" />
        Shared links
      </SidebarGroupLabel>

      <SidebarMenu>
        {shares.isLoading && (
          <SidebarMenuItem>
            <div className="px-2 py-2 text-xs opacity-70">A carregar…</div>
          </SidebarMenuItem>
        )}

        {shares.isError && (
          <SidebarMenuItem>
            <div className="px-2 py-2 text-xs text-red-600">
              {shares.error?.message ?? "Erro a carregar links"}
            </div>
          </SidebarMenuItem>
        )}

        {!shares.isLoading && !shares.data?.length && (
          <SidebarMenuItem>
            <div className="px-2 py-2 text-xs opacity-70">
              Sem links ativos.
            </div>
          </SidebarMenuItem>
        )}

        {shares.data?.map((s) => {
          const url = `${window.location.origin}/share/${s.token}`;
          return (
            <SidebarMenuItem key={s._id} className="group">
              <div className="flex w-full items-center gap-2 px-2 py-1">
                <SidebarMenuButton className="h-fit py-1 flex-1 justify-start">
                  <span className="text-xs font-medium">
                    {s.permission === "EDIT" ? "EDIT" : "READ"}
                  </span>
                  <span className="ml-2 text-xs opacity-60 truncate">
                    {s.token.slice(0, 8)}…
                  </span>
                </SidebarMenuButton>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Copy"
                  onClick={() => handleCopy(url)}
                >
                  <Copy className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Open"
                  onClick={() => window.open(url, "_blank")}
                >
                  <ExternalLink className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600"
                  title="Revoke"
                  disabled={revoke.isPending}
                  onClick={() =>
                    revoke.mutate(
                      { shareId: s._id, token },
                      {
                        onSuccess: () => toast({ title: "Link revogado." }),
                        onError: (e: any) =>
                          toast({
                            title: "Erro ao revogar",
                            description: e?.message ?? "Falha ao revogar link",
                            variant: "destructive",
                          }),
                      },
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
