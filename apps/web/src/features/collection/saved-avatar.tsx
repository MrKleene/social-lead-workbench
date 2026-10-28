import {UserRound} from 'lucide-react';
import {Avatar,AvatarImage,AvatarFallback} from '@/components/ui/avatar';
import {displayAvatar} from './display-metadata';
export function SavedAvatar({url}:{url?:string}) {const safe=displayAvatar(url);return <Avatar className="info-avatar" aria-hidden="true">{safe&&<AvatarImage src={safe} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer"/>}<AvatarFallback><UserRound size={17}/></AvatarFallback></Avatar>;}
