import type { CSSProperties } from 'react';

// Bounded vector/compositor decoration: no canvas backing store multiplied by devicePixelRatio.
// Fixed seeds keep the scene stable across React renders; only decorative pixels move.
export function StarDust() {
 return <div className="space-dust" aria-hidden="true">{Array.from({length:40},(_,i)=><i key={i} className="space-particle space-dust-dot" style={{left:`${(i*37.17+7)%100}%`,top:`${(i*23.71+11)%91}%`,'--drift-x':`${35+(i%5)*14}px`,'--drift-y':`${-55-(i%4)*19}px`,'--duration':`${14+i%9}s`,'--delay':`${-(i*3.7)%23}s`,'--size':`${1.6+(i%4)*.55}px`} as CSSProperties}/>)}</div>;
}
export function CoreParticles() {
 return <div className="space-core-particles" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} className="space-particle space-orbit-dot" style={{offsetDistance:`${i*100/12}%`,'--duration':`${10+i%4*2}s`,'--delay':`${-i*1.7}s`,'--size':`${i%3===0?3.5:2}px`} as CSSProperties}/>)}</div>;
}
export function FlowParticles({path,color,phase=0}:{path:string;color:string;phase?:number}) {
 return <g aria-hidden="true" className="space-flow-particles">{[0,1].map(i=><circle key={i} className="space-particle space-flow-dot" r={i?1.7:2.2} fill={color} style={{offsetPath:`path('${path}')`,offsetDistance:`${(phase*17+i*50)%100}%`,'--delay':`${-phase*.8-i*3.5}s`,'--duration':'7s'} as CSSProperties}/>)}</g>;
}
