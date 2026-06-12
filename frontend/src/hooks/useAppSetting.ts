import { useQuery } from '@tanstack/react-query'
import { appSettingsApi } from '../api/appSettings'

export function useAppSetting(key: string, fallback: string[] = []) {
  const { data } = useQuery({
    queryKey: ['setting', key],
    queryFn: () => appSettingsApi.get(key),
    staleTime: 5 * 60 * 1000,
  })
  return data ?? fallback
}
