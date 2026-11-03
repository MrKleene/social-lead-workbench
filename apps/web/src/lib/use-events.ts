import {useEffect} from 'react';
import {useQueryClient,useQuery,skipToken} from '@tanstack/react-query';
import {connectJourneyEvents,journeyConnectionKey,type JourneyConnection} from './journey-event-sync';
export function useEvents(enabled:boolean){const client=useQueryClient();useEffect(()=>enabled?connectJourneyEvents(client):undefined,[client,enabled]);}
export function useJourneyConnection(){return useQuery<JourneyConnection>({queryKey:journeyConnectionKey,queryFn:skipToken,enabled:false,initialData:'connecting'}).data;}
/** Only a degraded/missing stream polls; the healthy stream is event driven. */
export function useJourneyPolling(){return useJourneyConnection()==='connected'?false:30000;}
