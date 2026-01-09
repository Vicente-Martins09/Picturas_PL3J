"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Share2, Copy } from "lucide-react";
import { useCreateShare } from "@/lib/mutations/share";
import { useQueryClient } from "@tanstack/react-query";


import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";

type Permission = "READ" | "EDIT";

export function ShareDialog() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<Permission>("READ");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const createShareMutation = useCreateShare();
  

  const { toast } = useToast();
  const { _id: pid } = useProjectInfo();
  const session = useSession();

  async function handleCreate() {
  try {
    setLoading(true);
    setShareUrl("");

    const data = await createShareMutation.mutateAsync({
      uid: session.user._id,
      pid,
      token: session.token,
      permission,
    });

    qc.invalidateQueries({ queryKey: ["share-links", session.user._id, pid] });

    const url = `${window.location.origin}/share/${data.token}`;
    setShareUrl(url);

    toast({ title: "Share link created." });
  } catch (e: any) {
    const msg =
      e?.response?.data ||
      e?.response?.statusText ||
      e?.message ||
      "Erro ao criar partilha";
    toast({
      title: "Ups! An error occurred.",
      description: e?.message ?? "Erro ao criar partilha",
      variant: "destructive",
    });
  } finally {
    setLoading(false);
  }
}


  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied." });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="inline-flex" variant="outline">
          <Share2 /> Share
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Create a public share link for this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm">Permission</label>
            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={permission}
              onChange={(e) => setPermission(e.target.value as Permission)}
            >
              <option value="READ">Read</option>
              <option value="EDIT">Edit</option>
            </select>
          </div>

          {shareUrl && (
            <div className="space-y-2">
              <input
                className="w-full rounded-md border px-2 py-2 text-sm"
                value={shareUrl}
                readOnly
              />
              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="inline-flex">
                  <Copy className="mr-1 size-4" /> Copy
                </Button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border px-3 text-sm"
                >
                  Open
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={loading} className="inline-flex items-center gap-1">
            <span>Create link</span>
            {loading && <LoaderCircle className="size-[1em] animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
