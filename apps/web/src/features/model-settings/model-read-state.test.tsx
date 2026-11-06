import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const state=vi.hoisted(()=>({query:{isPending:false,isError:true,error:new Error('读取失败'),data:undefined,refetch:vi.fn()}}));
vi.mock('./use-model-settings',()=>({useModelSettings:()=>state.query}));
import {ModelSettingsBody} from './model-settings-panel';
describe('model configuration read recovery',()=>{
 it('renders a retry action with the read error instead of an empty panel',()=>{const html=renderToStaticMarkup(<ModelSettingsBody onBusyChange={()=>{}}/>);expect(html).toContain('读取失败');expect(html).toContain('重试读取模型配置');expect(html).not.toContain('type="password"');});
 it('keeps loading distinct from failure and does not expose an editable form',()=>{state.query.isPending=true;const html=renderToStaticMarkup(<ModelSettingsBody onBusyChange={()=>{}}/>);expect(html).toContain('加载中');expect(html).not.toContain('重试读取模型配置');state.query.isPending=false;});
});
