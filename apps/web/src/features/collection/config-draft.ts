import type {Config, ConfigDraft} from './types';

export const keywordWords = (value: string) => value.split(/[\n,，、]/).map(v => v.trim()).filter(Boolean);

// Copy only the existing input contract, never runtime/history fields. Editing the
// two visible fields must not reset any of the hidden collection settings.
export function keywordDraft(name: string, content: string, config?: Config, defaults?: Pick<ConfigDraft, 'platform'|'mode'>): ConfigDraft {
    return {
        name: name.trim(), keywords: keywordWords(content),
        platform: config?.platform ?? defaults?.platform ?? 'XHS',
        mode: config?.mode ?? defaults?.mode ?? 'MOCK',
        batchLimit: config?.batchLimit ?? 1,
        enabled: config?.enabled ?? true,
        excludeWords: config?.excludeWords ?? [],
        defaultExecutionAccountId: config?.defaultExecutionAccountId ?? null,
        defaultReplyTemplateId: config?.defaultReplyTemplateId ?? null,
        ...(config?.legacyMatchingEnabled !== undefined ? {legacyMatchingEnabled: config.legacyMatchingEnabled} : {}),
        ...(config?.semanticRules !== undefined ? {semanticRules: config.semanticRules} : {}),
        ...(config?.commentRules !== undefined ? {commentRules: config.commentRules} : {}),
    };
}
export function keywordDefaults(config: Config | undefined, availableMode: ConfigDraft['mode'] | null): Pick<ConfigDraft,'platform'|'mode'> {
    // Follow the currently selected collection environment, not a different account
    // or platform. New groups still need an explicit account in collection settings.
    return config ? {platform:config.platform,mode:config.mode} : {platform:'XHS',mode:availableMode ?? 'MOCK'};
}
export function keywordValidation(name: string, content: string): string | null {
    if (!name.trim()) return '请填写描述';
    const words = keywordWords(content);
    if (!words.length || words.length > 8) return '请填写 1–8 个关键词';
    if (words.some(word => word.length > 40)) return '每个关键词最多 40 字';
    if (new Set(words.map(word => word.normalize('NFKC').toLowerCase())).size !== words.length) return '关键词不能重复';
    return null;
}
