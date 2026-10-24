import {BadRequestException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {postSchema,type ConfigInput} from './contract';
import {savedPostReference} from './post-reference';
export const readPlanSchema=z.object({rounds:z.literal(1),postsPerRound:z.number().int().min(1).max(20),commentPages:z.number().int().min(1).max(4),restartCheckpoint:z.boolean().optional(),savedPostId:z.string().min(1).max(100).optional()}).strict().refine(p=>!p.restartCheckpoint||!!p.savedPostId,'仅定向读取可重新建立检查点').refine(p=>!p.savedPostId||(p.postsPerRound===1&&p.commentPages===1),'指定帖子只允许一篇、一个受控读取计划');
export type ReadPlan=z.infer<typeof readPlanSchema>;
/** Read only the selected archive row; never accept a caller-supplied URL or search fallback. */
export async function savedReadTarget(db:Pick<Prisma.TransactionClient,'capturedPost'>,configId:string,id:string,mode:ConfigInput['mode']){
 const row=await db.capturedPost.findFirst({where:{id,configId},select:{platformPostId:true,snapshot:true}});
 if(!row)throw new NotFoundException('所选帖子不属于当前配置或已不存在');
 const snapshot=row.snapshot as Record<string,unknown>,sourceReference=savedPostReference(snapshot.sourceReference,row.platformPostId);
 if(mode==='XHS_MCP'&&!sourceReference)throw new BadRequestException('此帖缺少有效原文访问引用，不能定向读取；不会改用搜索');
 return postSchema.parse({id:row.platformPostId,title:typeof snapshot.title==='string'?snapshot.title:'',...(sourceReference?{sourceReference}:{})});
}
