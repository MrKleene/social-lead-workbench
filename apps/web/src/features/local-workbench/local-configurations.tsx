import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "@/lib/router-compat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Cpu, Filter, MessageSquare, Send, Tag } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ContentSection } from "@/components/patterns/content-section";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { SidebarNav } from "@/components/patterns/sidebar-nav";
import { keywordValidation, keywordWords } from "@/features/collection/config-draft";
import {
  configurationPath,
  configurationTab,
  configurationTabs,
} from "@/features/configuration/configuration-route";
import type { ConfigurationTab } from "@/features/configuration/configuration-route";
import { useConfirmDiscard, useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LocalModelSettings } from "./local-model-settings";
import type { ConfigurationKind, LocalConfiguration } from "./local-api";
import { useLocalWorkbench } from "./use-local-workbench";

const tabIcons: Record<ConfigurationTab, typeof Tag> = {
  keywords: Tag,
  matching: Filter,
  templates: MessageSquare,
  "dm-templates": Send,
  model: Cpu,
};

function TabIcon({ id }: { id: ConfigurationTab }) {
  const Icon = tabIcons[id];
  return <Icon size={18} />;
}

const kinds: Record<string, ConfigurationKind> = {
  keywords: "KEYWORDS",
  matching: "MATCHING",
  templates: "COMMENT_TEMPLATE",
  "dm-templates": "DM_TEMPLATE",
};

function Editor({
  kind,
  item,
  onSave,
  onCancel,
  pending,
  onDirty,
}: {
  kind: ConfigurationKind;
  item?: LocalConfiguration;
  onSave: (value: Partial<LocalConfiguration>) => Promise<unknown>;
  onCancel: () => void;
  pending: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [text, setText] = useState(
    item?.body.keywords?.join("\n") ?? item?.body.text ?? "",
  );
  const [exclude, setExclude] = useState(
    item?.body.excludeWords?.join("\n") ?? "",
  );
  const [error, setError] = useState("");

  const dirty =
    name !== (item?.name ?? "") ||
    text !== (item?.body.keywords?.join("\n") ?? item?.body.text ?? "") ||
    exclude !== (item?.body.excludeWords?.join("\n") ?? "");

  useDraftGuard(dirty, "modal");
  useDraftGuard(pending, "pending");
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const failure =
      kind === "KEYWORDS"
        ? keywordValidation(name, text)
        : !name.trim() || !text.trim()
          ? "请填写描述和内容。"
          : null;
    if (failure) {
      setError(failure);
      return;
    }
    try {
      await onSave({
        ...item,
        kind,
        name,
        body:
          kind === "KEYWORDS"
            ? { keywords: keywordWords(text), excludeWords: keywordWords(exclude) }
            : { text },
      });
    } catch {
      /* mutation error remains visible */
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <h2 className="text-section font-semibold">
        {item ? "编辑配置" : "新增配置"}
      </h2>
      <FormField label="描述">
        <Input
          aria-label="配置描述"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </FormField>
      <FormField label={kind === "KEYWORDS" ? "关键词内容" : "配置内容"}>
        <Textarea
          value={text}
          rows={8}
          maxLength={kind === "MATCHING" ? 1500 : 4000}
          onChange={(event) => setText(event.target.value)}
          required
        />
      </FormField>
      {kind === "KEYWORDS" ? (
        <FormField label="排除词">
          <Textarea
            rows={3}
            value={exclude}
            onChange={(event) => setExclude(event.target.value)}
          />
        </FormField>
      ) : null}
      {error ? (
        <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending}>
          保存配置
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消编辑
        </Button>
      </div>
    </form>
  );
}

export function LocalConfigurations() {
  const workbench = useLocalWorkbench();
  const [params, setParams] = useSearchParams();
  const tab = configurationTab(params.toString());
  const kind = kinds[tab];
  const items = workbench.configs.data?.filter((item) => item.kind === kind) ?? [];
  const selected =
    items.find((item) => item.id === params.get("config")) ?? items[0];
  const confirm = useConfirmDiscard();
  const [editor, setEditor] = useState<LocalConfiguration | "new" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [remove, setRemove] = useState(false);

  useEffect(() => {
    setEditor(null);
    setDirty(false);
    setRemove(false);
  }, [tab]);

  const leave = async () =>
    !workbench.save.isPending &&
    (!dirty || (await confirm("当前配置尚未保存，是否放弃修改？")));

  return (
    <div className="flex flex-col">
      <PageHeader
        title="配置管理"
        actions={
          tab === "model" ? undefined : (
            <Button
              onClick={async () => {
                if (await leave()) {
                  setEditor("new");
                  setRemove(false);
                }
              }}
            >
              新增配置
            </Button>
          )
        }
      />
      <Separator className="my-4" />

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SidebarNav
          aria-label="配置分类"
          activeHref={configurationPath(tab)}
          className="lg:sticky lg:top-5 lg:self-start"
          items={configurationTabs.map((entry) => ({
            href: configurationPath(entry.id),
            title: entry.label,
            icon: <TabIcon id={entry.id} />,
          }))}
        />

        <section key={tab} className="flex min-w-0 flex-col gap-4">
          {tab === "model" ? (
            <LocalModelSettings
              keyConfigured={!!workbench.status.data?.modelKeyConfigured}
            />
          ) : (
            <>
              {workbench.error ? (
                <ErrorNotice error={workbench.error} />
              ) : null}
              {workbench.notice ? (
                <p role="status" className="text-body text-muted-foreground">
                  {workbench.notice}
                </p>
              ) : null}

              <div className="grid items-start gap-5 xl:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
                <aside
                  aria-label="已有配置"
                  className="flex min-w-0 flex-col gap-1.5"
                >
                  <h2 className="px-3 text-caption text-muted-foreground">
                    已有配置 · {items.length}
                  </h2>
                  {items.map((item) => (
                    <Button
                      variant="ghost"
                      key={item.id}
                      aria-pressed={!editor && selected?.id === item.id}
                      className="h-auto min-h-16 flex-col items-start justify-start gap-1.5 px-3 py-3 text-start whitespace-normal aria-pressed:bg-muted"
                      onClick={async () => {
                        if (await leave()) {
                          setEditor(null);
                          setRemove(false);
                          setParams({ tab, config: item.id });
                        }
                      }}
                    >
                      <span className="text-body font-semibold break-words">
                        {item.name}
                      </span>
                      <small className="line-clamp-2 text-caption leading-relaxed text-muted-foreground break-words">
                        {item.body.keywords?.join(" / ") ?? item.body.text}
                      </small>
                    </Button>
                  ))}
                </aside>

                <ContentSection
                  aria-label="配置详情"
                  className="min-w-0"
                  title={
                    editor
                      ? editor === "new"
                        ? "新增配置"
                        : "编辑配置"
                      : (selected?.name ?? "配置详情")
                  }
                  actions={
                    !editor && selected ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setEditor(selected)}
                        >
                          编辑配置
                        </Button>
                        <AlertDialog
                          open={remove}
                          onOpenChange={setRemove}
                        >
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive">删除配置</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除配置</AlertDialogTitle>
                              <AlertDialogDescription>
                                删除后无法恢复。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() =>
                                  workbench.remove.mutate(
                                    {
                                      id: selected.id,
                                      revision: selected.revision,
                                    },
                                    { onSuccess: () => setRemove(false) },
                                  )
                                }
                              >
                                确认删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : undefined
                  }
                >
                  {editor ? (
                    <Editor
                      key={editor === "new" ? "new" : editor.id}
                      kind={kind}
                      item={editor === "new" ? undefined : editor}
                      onDirty={setDirty}
                      pending={workbench.save.isPending}
                      onSave={async (value) => {
                        const result = await workbench.save.mutateAsync(value);
                        setDirty(false);
                        setEditor(null);
                        return result;
                      }}
                      onCancel={() =>
                        void leave().then((ok) => {
                          if (ok) setEditor(null);
                        })
                      }
                    />
                  ) : selected ? (
                    <>
                      <DetailList>
                        <DetailItem label="描述">{selected.name}</DetailItem>
                        <DetailItem label="内容">
                          <span className="whitespace-pre-wrap">
                            {selected.body.keywords?.join("\n") ??
                              selected.body.text}
                          </span>
                        </DetailItem>
                        {kind === "KEYWORDS" ? (
                          <DetailItem label="排除词">
                            {selected.body.excludeWords?.join("、") || "未设置"}
                          </DetailItem>
                        ) : null}
                      </DetailList>

                      {workbench.remove.error ? (
                        <div className="border-t pt-4">
                          <ErrorNotice error={workbench.remove.error} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-body text-muted-foreground">
                      尚无此类配置，请新增。
                    </p>
                  )}
                </ContentSection>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
