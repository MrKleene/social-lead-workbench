
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { useState, FormEvent } from "react";
import { Layers } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "./use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
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
    <main className="login-screen graphite-login">
      <div className="login-brand"><Layers aria-hidden="true"/><span>Social Lead</span></div>
      <form onSubmit={submit} className="login-form" aria-labelledby="login-title"><FieldGroup className="form-fields">
          <h1 id="login-title">登录</h1>
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
            </Field>
          </FieldGroup>
          <FormField className="login-remember">
            <Checkbox  checked={remember} onCheckedChange={e => setRemember((e === true))} />
            <span>在此设备记住登录 30 天<small>仅限自己的设备；退出登录即失效。</small></span>
          </FormField>
          <ErrorNotice error={login.error || sessionError} />
          <Button className="login-submit" type="submit" disabled={login.isPending}>
            {login.isPending&&<Spinner/>}{login.isPending ? "正在验证…" : "登录"}
          </Button>
        </FieldGroup></form>
    </main>
  );
}
