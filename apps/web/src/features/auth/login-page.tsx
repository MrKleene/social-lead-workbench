
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { useState, FormEvent } from "react";
import { ArrowRight, Layers, LockKeyhole, ShieldCheck } from "lucide-react";
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
  const { login, sessionError } = useAuth();
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password, remember }, { onSettled: () => setPassword("") });
  }
  return (
    <main className="login-screen mist-login">
      <section className="login-story">
        <div className="brand">
          <span className="login-brand-mark"><Layers aria-hidden="true" /></span>
          <span><strong>Social Lead</strong><small>AI 辅助获客工作台</small></span>
        </div>
        <div>
          <div className="story-line" />
          <h1>
            从发现需求，
            <br />
            到有据可查的跟进。
          </h1>
          <p>
            保存帖子、评论与回复，专注每一次判断。
          </p>
        </div>
        <p className="login-foot">
          <ShieldCheck size={18} />
          采集、判断、跟进，各有清晰入口
        </p>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit} className="login-form"><FieldGroup className="form-fields">
          <div className="login-symbol">
            <LockKeyhole />
          </div>
          <h2>欢迎回来</h2>
          <p className="muted">登录工作账号，继续今天的工作。</p>
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
                使用管理员创建的账号，无默认密码。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <FormField className="login-remember">
            <Checkbox  checked={remember} onCheckedChange={e => setRemember((e === true))} />
            <span>在此设备记住登录 30 天<small>仅在自己的设备上勾选；退出登录即失效。</small></span>
          </FormField>
          <ErrorNotice error={login.error || sessionError} />
          <Button className="w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? "正在验证…" : "登录工作台"}
            <ArrowRight data-icon="inline-end" />
          </Button>
          <p className="login-disclaimer">
            登录不会启动采集、模型调用或发送消息。
          </p>
        </FieldGroup></form>
      </section>
    </main>
  );
}
