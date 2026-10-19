import { useState, FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "./use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { ErrorNotice } from "@/components/feedback";
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSettled: () => setPassword("") });
  }
  return (
    <main className="login-screen">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">L</span>
          <strong>线索工作台</strong>
        </div>
        <div>
          <div className="story-line" />
          <h1>
            让需求有据可查，
            <br />
            让跟进井然有序。
          </h1>
          <p>
            一个清晰的工作台，连接人工核验、
            <br />
            线索分配与团队协作。
          </p>
        </div>
        <p className="login-foot">
          <ShieldCheck size={18} />
          本机开发 · 平台能力尚未接入
        </p>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <div className="login-symbol">
            <LockKeyhole />
          </div>
          <h2>欢迎回来</h2>
          <p className="muted">登录你的工作账号，继续今天的跟进。</p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">登录邮箱</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="请输入邮箱"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="请输入密码"
              />
              <FieldDescription>
                隔离模拟预览：使用启动终端本次显示的 admin@fixture.invalid 和临时密码；原有账号不在隔离库。正式本机环境请由管理员初始化。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <ErrorNotice error={login.error} />
          <Button className="w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? "正在验证…" : "登录工作台"}
            <ArrowRight data-icon="inline-end" />
          </Button>
          <p className="login-disclaimer">
            没有默认账号。演示数据不包含真实平台用户资料。
          </p>
        </form>
      </section>
    </main>
  );
}
