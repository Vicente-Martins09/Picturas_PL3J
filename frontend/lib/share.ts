import { api } from "./axios";

export type SharePermission = "READ" | "EDIT";

export type CreateShareArgs = {
  uid: string;
  pid: string;
  token: string; // JWT
  permission: SharePermission;
  createdBy?: string;
  expiresAt?: string;
};

export type ShareLink = {
  _id: string;
  token: string;
  projectId: string;
  permission: SharePermission;
  createdBy?: string;
  expiresAt?: string;
};

export async function createShare({ uid, pid, token, permission }: CreateShareArgs) {
  const res = await api.post(
    `/share/${uid}`,
    { projectId: pid, permission },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.data; // deve vir { token, projectId, permission, expiresAt, ... }
}

export async function validateShare(shareToken: string) {
  const res = await api.get(`/share/validate/${shareToken}`);
  return res.data; // deve vir { projectId, permission, ... }
}

export async function fetchSharedProject(shareToken: string) {
  const res = await api.get(`/share/project/${shareToken}`);
  return res.data; // devolve o projeto + share.permission
}

export async function clearSharedTools(shareToken: string) {
  const res = await api.delete(`/share/project/${shareToken}/tools`);
  return res.data;
}

export async function listProjectShares(uid: string, pid: string, token: string) {
  const res = await api.get<ShareLink[]>(`share/${uid}/project/${pid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function revokeShare(uid: string, shareId: string, token: string) {
  const res = await api.delete(`share/${uid}/${shareId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status; // 204 esperado
}
