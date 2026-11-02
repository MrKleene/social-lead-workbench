export const configurationTabs=[{id:'keywords',label:'关键词配置'},{id:'matching',label:'评论匹配方案配置'},{id:'templates',label:'发送模板配置'},{id:'dm-templates',label:'私信模板配置'},{id:'model',label:'模型配置'}] as const;
export type ConfigurationTab=typeof configurationTabs[number]['id'];
export function configurationTab(search:string):ConfigurationTab{const value=new URLSearchParams(search).get('tab');return configurationTabs.find(t=>t.id===value)?.id||'keywords';}
export function configurationPath(tab:ConfigurationTab,search=''){const source=new URLSearchParams(search),next=new URLSearchParams({tab});for(const key of ['config','policy'])if(source.get(key))next.set(key,source.get(key)!);return '/configuration?'+next;}
export function changingConfigurationTab(current:{pathname:string;search:string},next:{pathname:string;search:string}){return current.pathname==='/configuration'&&next.pathname==='/configuration'&&configurationTab(current.search)!==configurationTab(next.search);}
