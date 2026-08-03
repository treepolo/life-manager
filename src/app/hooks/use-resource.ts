import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { archiveResource, createResource, listResource, updateResource } from "@/app/api/client";

export function useResource<T extends Record<string, unknown>>(resource: string, query = "") {
  const queryClient = useQueryClient();
  const key = [resource, query];
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => listResource<T>(resource, query, signal) });
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => createResource(resource, data),
    onSuccess: (entity) => {
      queryClient.setQueriesData<T[]>({ queryKey: [resource] }, (current) => {
        if (!current) return current;
        const withoutCurrent = current.filter((item) => item.id !== entity.id);
        return [...withoutCurrent, entity as T];
      });
      return queryClient.invalidateQueries({ queryKey: [resource] });
    },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; version: number; patch: Record<string, unknown> }) => updateResource(resource, input.id, input.version, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
  const archive = useMutation({
    mutationFn: (input: { id: string; version: number; restore?: boolean }) => archiveResource(resource, input.id, input.version, input.restore),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
  return { list, create, update, archive };
}
