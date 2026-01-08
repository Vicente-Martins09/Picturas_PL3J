import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

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
