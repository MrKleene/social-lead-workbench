import {ConflictException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
export const singlePostAction='SINGLE_POST_CHECK_RESERVED';
export async function lockSinglePost(tx:Prisma.TransactionClient){await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1833724486)`;}
export async function assertNoSinglePost(tx:Prisma.TransactionClient){
 const pending=await tx.auditLog.findFirst({where:{action:singlePostAction,createdAt:{gt:new Date(Date.now()-300000)}}});
 if(pending)throw new ConflictException('单帖检查正在进行；请等本次检查结束');
}
