import {useRef,useState} from 'react';
import {useConfirmDiscard,useDraftGuard} from './draft-guard';
// Keep the edit snapshot stable while background queries refresh existing items.
export function useConfigurationEditor<T extends {id:string}>(items:T[],initialId='') {
 const sequence=useRef(0);
 const [id,setId]=useState(initialId),[editor,setEditor]=useState<{item?:T;key:number}|null>(null);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),confirm=useConfirmDiscard();
 useDraftGuard(dirty,'modal');useDraftGuard(busy,'pending');
 const selected=items.find(item=>item.id===id)||items[0];
 const change=async(action:()=>void)=>{if(busy)return;if(dirty&&!await confirm('当前配置尚未保存，确定放弃修改吗？'))return;setDirty(false);action();};
 return {selected,editor,dirty,busy,setDirty,setBusy,
  select:(item:T)=>change(()=>{setId(item.id);setEditor(null);}),
  create:()=>change(()=>setEditor({key:++sequence.current})),edit:()=>change(()=>{if(selected)setEditor({item:selected,key:++sequence.current});}),
  cancel:()=>change(()=>setEditor(null)),
  saved:(savedId?:string)=>{setDirty(false);setBusy(false);if(savedId)setId(savedId);setEditor(null);}};
}
