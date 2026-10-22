import {useState} from 'react';
import {UserRound} from 'lucide-react';
import {displayAvatar} from './display-metadata';
export function SavedAvatar({url}:{url?:string}){const [failed,setFailed]=useState(''),safe=displayAvatar(url);return <span className="info-avatar" aria-hidden="true">{safe&&failed!==safe?<img src={safe} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailed(safe)}/>:<UserRound size={17}/>}</span>;}
