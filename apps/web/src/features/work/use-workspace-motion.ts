import { useEffect, useLayoutEffect, useState } from 'react';
import { bindWorkspaceVisibility } from './workspace-visibility';
import { reduceWorkspaceMotion, type MotionPreference } from './motion-policy';

/** Honor OS preference by default; an explicit page choice never changes OS settings. */
export function useWorkspaceMotion() {
  const [preference,setPreference] = useState<MotionPreference>('system');
  const [systemReduced,setSystemReduced] = useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced=reduceWorkspaceMotion(preference,systemReduced);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const changed=()=>setSystemReduced(media.matches);
    changed();media.addEventListener('change',changed);
    return()=>media.removeEventListener('change',changed);
  },[]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.crmTheme = 'graphite';
    const unbindVisibility=bindWorkspaceVisibility(document,root);
    return () => {
      unbindVisibility();
      delete root.dataset.crmTheme;delete root.dataset.crmHidden;delete root.dataset.crmReduced;delete root.dataset.crmMotionOverride;
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.crmReduced=String(reduced);
    document.documentElement.dataset.crmMotionOverride=preference;
  }, [reduced,preference]);
  return { reduced,systemReduced,preference,toggle:()=>setPreference(reduced?'full':'reduced') };
}
