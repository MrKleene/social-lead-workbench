import { useEffect, useState } from 'react';

/** One scoped theme for authenticated pages, including Radix portals. */
export function useWorkspaceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.crmTheme = 'graphite';
    const visibility = () => {
      root.dataset.crmHidden = String(document.hidden);
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      delete root.dataset.crmTheme;
      delete root.dataset.crmHidden;
      delete root.dataset.crmReduced;
    };
  }, []);
  useEffect(() => { document.documentElement.dataset.crmReduced = String(reduced); }, [reduced]);
  return { reduced, toggle: () => setReduced(value => !value) };
}
