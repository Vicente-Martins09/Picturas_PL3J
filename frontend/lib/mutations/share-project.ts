import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addToolShared,
  updateToolShared,
  deleteToolShared,
  previewShared,
  processShared,
} from "@/lib/share-project";

export const useAddToolShared = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addToolShared,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["shared-project", vars.shareToken] });
    },
  });
};

export const useUpdateToolShared = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateToolShared,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["shared-project", vars.shareToken] });
    },
  });
};

export const useDeleteToolShared = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteToolShared,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["shared-project", vars.shareToken] });
    },
  });
};

export const usePreviewShared = () => {
  // preview normalmente não muda “tools”; mas pode ser útil refazer results/imagens se a UI mostrar preview
  return useMutation({
    mutationFn: previewShared,
  });
};

export const useProcessShared = () => {
  return useMutation({
    mutationFn: processShared,
  });
};