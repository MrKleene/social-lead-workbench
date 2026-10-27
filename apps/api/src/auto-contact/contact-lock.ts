import type {Prisma} from '@prisma/client';
/** Shared transaction lock for dispatch, evidence and platform safety latches. */
export async function contactLock(tx:Prisma.TransactionClient){await tx.$executeRaw`SELECT pg_advisory_xact_lock(70272026)`;}
