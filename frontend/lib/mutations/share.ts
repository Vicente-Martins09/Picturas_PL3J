import { useMutation,useQueryClient } from "@tanstack/react-query";
import { createShare } from "../share";
import { clearSharedTools } from "../share";
import { revokeShare } from "@/lib/share";

export const useCreateShare = () => {
  return useMutation({
    mutationFn: createShare,
  });
};

export const useClearSharedTools = () =>
  useMutation({
    mutationFn: (shareToken: string) => clearSharedTools(shareToken),
  });




export const useRevokeShareLink = (uid: string, pid: string) => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ shareId, token }: { shareId: string; token: string }) =>
      revokeShare(uid, shareId, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-links", uid, pid] });
    },
  });
};
