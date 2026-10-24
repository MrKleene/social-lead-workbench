import 'reflect-metadata';
import {it,expect,vi} from 'vitest';
import {readPlanSchema,savedReadTarget} from '../src/collection/saved-post-read';
const id='0123456789abcdef01234567',ref={postId:id,token:'SYNTHETIC_ACCESS_REFERENCE',source:'pc_search'};
it('only uses a saved reference matching the selected post; no arbitrary URL or missing-reference fallback',async()=>{
 const findFirst=vi.fn(async()=>({platformPostId:id,snapshot:{title:'合成',sourceReference:ref}})),db={capturedPost:{findFirst}} as any;
 expect(await savedReadTarget(db,'cfg','row','XHS_MCP')).toEqual({id,title:'合成',sourceReference:ref});
 expect(findFirst).toHaveBeenCalledWith({where:{id:'row',configId:'cfg'},select:{platformPostId:true,snapshot:true}});
 for(const sourceReference of [undefined,{...ref,postId:'fedcba9876543210fedcba98'},{...ref,token:'bad?token=value'},{...ref,source:'evil'}]){
  findFirst.mockResolvedValueOnce({platformPostId:id,snapshot:{title:'合成',sourceReference}} as any);
  await expect(savedReadTarget(db,'cfg','row','XHS_MCP')).rejects.toThrow('缺少有效原文访问引用');
 }
 findFirst.mockResolvedValueOnce(null as any);await expect(savedReadTarget(db,'other','row','XHS_MCP')).rejects.toThrow('不属于');
});
it('saved selection cannot broaden to multi-post, multi-window or caller-supplied reference',()=>{
 const p={rounds:1,postsPerRound:1,commentPages:1,savedPostId:'row'};
 expect(readPlanSchema.safeParse(p).success).toBe(true);
 for(const v of [{...p,postsPerRound:3},{...p,commentPages:2},{...p,url:'https://example.invalid'},{...p,rounds:2},{...p,sourceReference:ref}])expect(readPlanSchema.safeParse(v).success).toBe(false);
});
