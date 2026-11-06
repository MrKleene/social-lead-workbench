'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Fixed methods only. No raw IPC, filesystem, network, execution or secret-read API.
const methods=['status','initialize','configurations','saveConfiguration','archiveConfiguration','saveModelKey','jobs','accounts','messages','markRead','backup','restore'];
contextBridge.exposeInMainWorld('localWorkbench',Object.freeze(Object.fromEntries(methods.map(name=>[name,input=>ipcRenderer.invoke('workbench:call',name,input)]))));
