import { useMutation } from "@tanstack/react-query";
import { createShare } from "../share";
import { clearSharedTools } from "../share";

export const useCreateShare = () => {
  return useMutation({
    mutationFn: createShare,
  });
};

export const useClearSharedTools = () =>
  useMutation({
    mutationFn: (shareToken: string) => clearSharedTools(shareToken),
  });