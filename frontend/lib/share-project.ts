import { api } from "./axios";

export type SharePermission = "READ" | "EDIT";

export async function addToolShared(args: {
  shareToken: string;
  procedure: string;
  params: any;
}) {
  const { shareToken, procedure, params } = args;
  const res = await api.post(`/share/project/${shareToken}/tool`, {
    procedure,
    params,
  });
  return res.data;
}

export async function updateToolShared(args: {
  shareToken: string;
  toolId: string;
  params: any;
}) {
  const { shareToken, toolId, params } = args;
  const res = await api.put(`/share/project/${shareToken}/tool/${toolId}`, {
    params,
  });
  return res.data;
}

export async function deleteToolShared(args: {
  shareToken: string;
  toolId: string;
}) {
  const { shareToken, toolId } = args;
  const res = await api.delete(`/share/project/${shareToken}/tool/${toolId}`);
  return res.data;
}

export async function previewShared(args: {
  shareToken: string;
  imageId: string;
}) {
  const { shareToken, imageId } = args;
  // se o teu gateway for /preview/:imgId, troca por isso
  const res = await api.post(`/share/project/${shareToken}/preview`, {
    imageId,
  });
  return res.data;
}

export async function processShared(args: { shareToken: string }) {
  const { shareToken } = args;
  const res = await api.post(`/share/project/${shareToken}/process`);
  return res.data;
}
