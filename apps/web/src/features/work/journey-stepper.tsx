import {Check,LoaderCircle,Pause,TriangleAlert,Clock3,Minus,HelpCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {StatusNotice} from '@/components/status-notice';
import type {JourneyStep} from './journey-step-state';
import type {JourneyStage} from './journey-model';
import './journey-stepper.css';
export function JourneyStepper({steps,selected,onSelect,caption,attention,details}:{steps:JourneyStep[];selected:JourneyStage;onSelect:(stage:JourneyStage)=>void;caption:string;attention:boolean;details?:string[]}){
 return <div className="journey-progress-track"><nav aria-label="任务步骤"><ol className="journey-progress-list">{steps.map((step,i)=>{
 const Icon=step.state==='complete'?Check:['running','loading'].includes(step.state)?LoaderCircle:step.state==='queued'?Clock3:step.state==='paused'?Pause:['failed','partial','unavailable'].includes(step.state)?TriangleAlert:step.state==='unknown'?HelpCircle:step.state==='skipped'?Minus:null;
 return <li key={step.id} data-state={step.state}><Button variant="ghost" size="content" className="journey-step-button" data-selected={selected===step.id} aria-pressed={selected===step.id} aria-label={`${step.label}，${step.status}${selected===step.id?'，正在查看':''}`} onClick={()=>onSelect(step.id)}><span className="journey-step-marker" aria-hidden="true">{Icon?<Icon size={16} className={['running','loading'].includes(step.state)?'journey-step-spinner':undefined}/>:i+1}</span><span className="journey-step-copy"><strong>{step.label}</strong><small role="status" aria-live="polite" aria-atomic="true">{step.status}</small></span></Button></li>;
 })}</ol></nav>{(details?.some(Boolean)||steps.some(step=>step.state==='unknown')||attention&&steps.every(step=>step.state==='idle'))&&<StatusNotice label={caption} attention={attention} details={details}/>}</div>;
}
