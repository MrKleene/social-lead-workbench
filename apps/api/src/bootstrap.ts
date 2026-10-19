import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import express from "express";
export function configure(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.enableShutdownHooks();
}
