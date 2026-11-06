import {defineConfig,mergeConfig} from 'vite';
import base from './vite.config';
import path from 'node:path';
export default mergeConfig(base,defineConfig({base:'./',build:{outDir:'dist-desktop',rollupOptions:{input:path.resolve(import.meta.dirname,'desktop.html')}}}));
