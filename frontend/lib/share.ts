import { api } from "./axios";

export type SharePermission = "READ" | "EDIT";

export type CreateShareArgs = {
  uid: string;
  pid: string;
  token: string; // JWT
  permission: SharePermission;
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
