import { createContext, useContext } from 'react';
export const AuroraMotionContext = createContext(false);
export const useAuroraReduced = () => useContext(AuroraMotionContext);
