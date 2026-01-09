import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { listProjectShares } from "@/lib/share";

const getSharedProject = async (token: string) => {
  const res = await api.get(`/share/project/${token}`);
  return res.data;
};

export const useGetSharedProject = (token: string) =>
  useQuery({
    queryKey: ["shared-project", token],
    queryFn: () => getSharedProject(token),
    enabled: !!token,
  });


export const useGetProjectShares = (
  uid: string,
  pid: string,
  token: string,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ["share-links", uid, pid],
    queryFn: () => listProjectShares(uid, pid, token),
    enabled: enabled && !!uid && !!pid && !!token,
  });
};
