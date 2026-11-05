import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {inboxApi} from './inbox-api';
import {useInboxEvents} from './use-inbox';
import './inbox.css';
export function InboxIndicator({enabled}:{enabled:boolean}){useInboxEvents(enabled);const q=useQuery({queryKey:['inbox','unread'],queryFn:inboxApi.unread,enabled,refetchOnWindowFocus:true}),last=useRef<number|null>(null),[notice,setNotice]=useState(false);useEffect(()=>{if(q.data){if(last.current!==null&&q.data.count>last.current)setNotice(true);last.current=q.data.count}},[q.data]);if(!enabled||!notice)return null;return <div className="inbox-live-announcement" role="status" aria-live="polite"><Link to="/inbox?unread=1" onClick={()=>setNotice(false)}>收到新消息 · 查看</Link><Button variant="ghost" size="sm" onClick={()=>setNotice(false)}>关闭</Button></div>}
export function InboxCount({enabled}:{enabled:boolean}){const q=useQuery({queryKey:['inbox','unread'],queryFn:inboxApi.unread,enabled});return q.data?.count?<span className="inbox-nav-count" aria-label={`${q.data.count} 条未读`}>{q.data.count>99?'99+':q.data.count}</span>:null}
