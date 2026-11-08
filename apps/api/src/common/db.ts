import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma handle shared by the collection and checkpoint modules.
 *
 * The desktop runtime never instantiates this: it runs against node:sqlite and
 * only reuses the pure functions in those modules. The class survives because
 * their transaction callbacks are typed against it, and because the legacy
 * read-only export path still builds a client from DATABASE_URL.
 */
export class Db extends PrismaClient {
  private displayClient?: PrismaClient;
  private readonly options?: Prisma.PrismaClientOptions;
  constructor(options?: Prisma.PrismaClientOptions) { super(options); this.options=options; }
  /** Display-only schema. Authorization, budgets, identity and workers always use public. */
  historyDisplay(): Db {
    if(!this.displayClient){
      const raw=this.options?.datasources?.db?.url??this.options?.datasourceUrl??process.env.DATABASE_URL;
      if(!raw)throw new Error('DATABASE_URL_REQUIRED');
      const url=new URL(raw);url.searchParams.set('schema','history_display');
      const client=new PrismaClient({...this.options,datasourceUrl:undefined,datasources:{db:{url:url.toString()}}});
      const readonly=client.$extends({query:{$allOperations({operation,args,query}){
        if(!['findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','findMany','count','aggregate','groupBy','$queryRaw','$queryRawUnsafe'].includes(operation))throw new Error('HISTORY_DISPLAY_READ_ONLY');
        return query(args);
      }}});
      this.displayClient=readonly as unknown as PrismaClient;
    }
    return this.displayClient as Db;
  }
  override async $disconnect() {
    await this.displayClient?.$disconnect();
    await super.$disconnect();
  }
}

/** Test doubles remain usable; real clients provide the explicit display connection. */
export function historyDisplay(db:Db):Db{return typeof db.historyDisplay==='function'?db.historyDisplay():db;}
