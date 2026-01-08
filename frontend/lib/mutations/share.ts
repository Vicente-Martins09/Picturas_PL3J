import { useMutation } from "@tanstack/react-query";
import { createShare } from "../share";

export const useCreateShare = () => {
  return useMutation({
    mutationFn: createShare,
  });
};
