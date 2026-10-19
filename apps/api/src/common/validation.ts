import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(result.error.issues.find(issue => issue.code === "custom")?.message || "输入格式错误，请检查必填项、长度与日期");
  return result.data;
}
export const dateOrNull = z.iso.datetime({ offset: true }).nullable();
