import {useQuery} from '@tanstack/react-query';
import type {ProjectOverview} from '@crm/contracts';
import {api} from '@/lib/api';
export function useProjectOverview(){return useQuery({queryKey:['project-overview'],queryFn:()=>api<ProjectOverview>('/collection/overview'),refetchInterval:15000,refetchIntervalInBackground:false,retry:false});}
