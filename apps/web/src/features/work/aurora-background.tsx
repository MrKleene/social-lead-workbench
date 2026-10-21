import {useEffect,useRef,useState} from 'react';
type View = 'overview' | 'review' | 'handoff';
const vertex=`attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
// Original procedural shader. No Active Theory code, textures or Hydra runtime.
const fragment=`precision mediump float;
uniform vec2 resolution;uniform vec2 pointer;uniform float time;uniform float phase;uniform float calm;
float hash(float n){return fract(sin(n*127.1)*43758.5453);}
void main(){vec2 uv=gl_FragCoord.xy/resolution;vec2 p=uv; p.x+=(pointer.x*.012);p.y+=pointer.y*.008;
vec3 lime=vec3(.52,.83,.32),violet=vec3(.43,.28,.78),teal=vec3(.13,.46,.42);
float arch=.72+.12*sin(p.x*4.4+time*.09)+.05*sin(p.x*9.-time*.12);
float ribbon=exp(-abs(p.y-arch)*7.5);float folds=.5+.5*sin(p.x*8.+p.y*3.+time*.15);
vec3 glow=mix(violet,lime,smoothstep(.12,.83,p.x+sin(time*.06)*.15));glow=mix(glow,teal,phase*.22);
vec3 color=vec3(.027,.042,.047)+glow*ribbon*(.25+.2*folds)*(1.-calm*.45);
color+=violet*.075*exp(-length((uv-vec2(.12,.22))*vec2(1.,2.))*3.);
vec2 aspect=vec2(resolution.x/resolution.y,1.);
for(int i=0;i<38;i++){float f=float(i);float z=.25+hash(f+8.)*.75;vec2 pos=vec2(hash(f+1.),hash(f+71.));pos.y=fract(pos.y+time*.003*z);pos+=pointer*.012*z;vec2 delta=(uv-pos)*aspect;float radius=mix(.0007,.0021,z);float dotLight=exp(-dot(delta,delta)/(radius*radius));float halo=exp(-dot(delta,delta)/(radius*radius*20.))*.08;color+=mix(violet,lime,hash(f+3.))*(dotLight+halo)*(.12+.45*z)*(1.-calm*.6);}
float edge=(1.-smoothstep(.2,.95,length((uv-.5)*vec2(1.,.75))));color*=.65+.35*edge;gl_FragColor=vec4(color,1.);}`;
export function SpaceBackdrop({view,quiet}:{view:View;quiet:boolean}){
 const ref=useRef<HTMLCanvasElement>(null);const state=useRef({view,quiet});state.current={view,quiet};
 const [failed,setFailed]=useState(false);const [staticMode,setStaticMode]=useState(false);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas||staticMode)return;
  let gl:WebGLRenderingContext|null=null,raf=0,disposed=false,elapsed=0,last=0,phase=0,calm=0;
  const pointer={x:0,y:0,tx:0,ty:0};let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
  const shaders:WebGLShader[]=[];
  const fail=()=>{cancelAnimationFrame(raf);raf=0;setFailed(true);canvas.dataset.renderer='fallback';};
  try{
   gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});if(!gl)throw Error('WebGL unavailable');
   const compile=(type:number,source:string)=>{const shader=gl!.createShader(type);if(!shader)throw Error('Shader unavailable');shaders.push(shader);gl!.shaderSource(shader,source);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))throw Error('Shader unavailable');return shader;};
   program=gl.createProgram();if(!program)throw Error('Program unavailable');gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Link unavailable');gl.useProgram(program);
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
   const uniform=(name:string)=>gl!.getUniformLocation(program!,name);const u={resolution:uniform('resolution'),pointer:uniform('pointer'),time:uniform('time'),phase:uniform('phase'),calm:uniform('calm')};
   const size=()=>{const dpr=Math.min(devicePixelRatio||1,1.25);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);gl!.viewport(0,0,canvas.width,canvas.height);};size();
   const draw=(now:number)=>{raf=0;if(disposed||document.hidden||gl!.isContextLost())return;const dt=last?Math.min(now-last,40):0;last=now;const s=state.current;if(!s.quiet)elapsed+=dt*(s.view==='overview'?1:.35);const target=s.view==='review'?1:s.view==='handoff'?2:0;phase+=(target-phase)*(s.quiet?1:.08);calm+=((s.view==='overview'?0:1)-calm)*(s.quiet?1:.08);pointer.x+=(pointer.tx-pointer.x)*.035;pointer.y+=(pointer.ty-pointer.y)*.035;gl!.uniform2f(u.resolution,canvas.width,canvas.height);gl!.uniform2f(u.pointer,s.quiet?0:pointer.x,s.quiet?0:pointer.y);gl!.uniform1f(u.time,elapsed/1000);gl!.uniform1f(u.phase,phase);gl!.uniform1f(u.calm,calm);gl!.drawArrays(gl!.TRIANGLES,0,3);canvas.dataset.renderer='webgl';canvas.dataset.motion=s.quiet?'paused':'running';if(!s.quiet)raf=requestAnimationFrame(draw);};
   const wake=()=>{last=0;if(!raf&&!document.hidden&&!disposed)raf=requestAnimationFrame(draw);};
   const visibility=()=>{cancelAnimationFrame(raf);raf=0;canvas.dataset.motion=document.hidden?'hidden':'paused';if(!document.hidden)wake();};
   const move=(e:PointerEvent)=>{if(state.current.quiet)return;pointer.tx=e.clientX/innerWidth*2-1;pointer.ty=1-e.clientY/innerHeight*2;};
   const resize=()=>{size();wake();};const lost=(e:Event)=>{e.preventDefault();fail();};
   window.addEventListener('pointermove',move,{passive:true});window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('space-wake',wake);setFailed(false);wake();
   return()=>{disposed=true;cancelAnimationFrame(raf);window.removeEventListener('pointermove',move);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('space-wake',wake);shaders.forEach(s=>gl!.deleteShader(s));gl!.deleteBuffer(buffer);gl!.deleteProgram(program);};
  }catch{fail();shaders.forEach(s=>gl?.deleteShader(s));if(buffer)gl?.deleteBuffer(buffer);if(program)gl?.deleteProgram(program);}
 },[staticMode]);
 useEffect(()=>{ref.current?.dispatchEvent(new Event('space-wake'));},[view,quiet]);
 return <><div className={`space-backdrop ${failed||staticMode?'is-fallback':''}`} aria-hidden="true"><canvas ref={ref}/><div className="space-vignette"/></div><button className="render-mode" onClick={()=>setStaticMode(v=>!v)} aria-pressed={staticMode}>{failed?'WebGL 不可用 · 静态背景':staticMode?'静态背景 · 点击恢复':'WebGL 光场 · 切换静态'}</button></>;
}
