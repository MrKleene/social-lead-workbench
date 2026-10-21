import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import express, {Request,Response,NextFunction} from "express";
export function configure(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use((error:unknown,req:Request,res:Response,next:NextFunction)=>{
    if(/^\/api\/model-settings\/?$/i.test(req.path)){req.body=undefined;res.setHeader('Cache-Control','no-store');res.status(400).json({message:'模型设置请求格式无效；未保存'});return;}
    next(error);
  });
  app.use(cookieParser());
  app.enableShutdownHooks();
}
