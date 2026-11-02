import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {RunPostReader} from './run-post-reader';
const state=vi.hoisted(()=>({args:[] as unknown[],props:{} as any,pending:false,error:false,missing:false}));
vi.mock('@/features/collection/archive-data',()=>({useArchivePage:(...args:unknown[])=>{state.args=args;return {data:{posts:state.missing?[]:[{id:'saved-post-a',platformPostId:'post-a',snapshot:{title:'虚构原帖',body:'完整已存正文'},lastSeenAt:'2026-11-02T00:00:00Z'}],items:[]},isPending:state.pending,isError:state.error,error:Error('虚构读取失败'),refetch:vi.fn()};}}));
vi.mock('@/features/collection/collection-post-detail',()=>({CollectionPostDetail:(props:any)=>{state.props=props;return <div>虚构原文阅读器</div>;}}));
const render=()=>renderToStaticMarkup(<RunPostReader configId="config-a" runId="run-a" postId="post-a" platform="XHS" onClose={vi.fn()}/>);
it('uses the selected run and post local archive and mounts the reader in read-only mode',()=>{expect(render()).toContain('虚构原文阅读器');expect(state.args).toEqual(['config-a',0,false,'post-a','run-a']);expect(state.props.readOnly).toBe(true);expect(state.props.readAction).toBeUndefined();expect(state.props.post.versions[0].snapshot.body).toBe('完整已存正文');});
it('does not invent unavailable source and retains local read error retry',()=>{state.missing=true;expect(render()).toContain('本轮没有可返回的帖子原文');state.missing=false;state.error=true;expect(render()).toContain('重试读取原文');state.error=false;state.pending=true;expect(render()).not.toContain('虚构原文阅读器');state.pending=false;});
