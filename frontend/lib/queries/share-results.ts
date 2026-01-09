import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

const getSharedResults = async (token: string) => {
  const res = await api.get(`/share/project/${token}/process/url`);
  return res.data; // { imgs: [...], texts: [...] }
};

export const useGetSharedResults = (token: string) =>
  useQuery({
    queryKey: ["shared-results", token],
    queryFn: () => getSharedResults(token),
    enabled: !!token,
  });
