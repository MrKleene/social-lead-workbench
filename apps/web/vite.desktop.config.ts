import {defineConfig,mergeConfig} from 'vite';
import type {Plugin} from 'vite';
import base from './vite.config';
import path from 'node:path';
// Dev only: the packaged app loads `workbench://app/`, so the router expects the
// document at `/`. Vite serves desktop.html at /desktop.html instead, and every
// route would fall through to "not found". Rewrite HTML requests to the desktop
// entry, which also reproduces the SPA fallback the protocol handler provides.
const desktopEntry=():Plugin=>({
 name:'desktop-entry-fallback',
 apply:'serve',
 configureServer(server){
  server.middlewares.use((req,_res,next)=>{
   const url=req.url;
   if(!url||!req.headers.accept?.includes('text/html'))return next();
   const pathname=url.split('?')[0];
   if(pathname.startsWith('/@')||pathname.startsWith('/src/')||/\.[a-z0-9]+$/i.test(pathname))return next();
   req.url='/desktop.html';
   next();
  });
 },
});
export default mergeConfig(base,defineConfig({base:'/',plugins:[desktopEntry()],build:{outDir:'dist-desktop',rollupOptions:{input:path.resolve(import.meta.dirname,'desktop.html')}}}));
