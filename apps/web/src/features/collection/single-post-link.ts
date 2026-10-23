// Mirrors the API reference parser, with one observed fixed page-source marker
// removed before submission. Pure local validation only; never echo
// the submitted address, arbitrary keys or values in a diagnostic.
const messages = {
 empty: '粘贴浏览器地址栏中的完整帖子链接。',
 length: '链接过长，请只复制这一篇帖子的地址。',
 format: '链接包含引号、空白或转义字符，请只粘贴地址本身。',
 origin: '需要小红书官网的 HTTPS 原文地址；不支持分享短链。',
 path: '需要浏览器中打开帖子的 /explore/ 原文地址。',
 components: '链接含不支持的地址部分，请从原帖地址栏重新复制。',
 escaped: '链接分隔符被转义，请从浏览器地址栏直接复制，不要复制网页代码。',
 reference: '缺少帖子访问引用；只有帖子编号的地址不能用于检查。',
 source: '缺少帖子来源信息，请复制完整地址，不要截掉问号后的内容。',
 parameters: '链接含重复或额外参数，当前检查入口不支持；不要手动猜改访问参数。',
 token: '帖子访问引用为空或格式不支持，请从原帖地址栏重新复制。',
 sourceValue: '此链接的来源类型暂不支持，尚未发起检查。',
 valid: '链接格式有效；点击后才核验账号，尚未访问小红书。',
} as const;
export type SinglePostLinkCode = keyof typeof messages;
export function inspectSinglePostLink(input: string): {valid: boolean; code: SinglePostLinkCode; message: string} {
 const result = (code: SinglePostLinkCode) => ({valid: code === 'valid', code, message: messages[code]});
 // Existing submit behavior trims outer whitespace; no other content is rewritten.
 const value = input.trim();
 if (!value) return result('empty');
 if (value.length > 8192) return result('length');
 if (/[\s\\]/.test(value) || /^["'“‘]|["'”’]$/.test(value)) return result('format');
 let url: URL;
 try { url = new URL(value); } catch { return result('format'); }
 if (url.origin !== 'https://www.xiaohongshu.com') return result('origin');
 if (url.username || url.password || url.port || url.hash) return result('components');
 const match = /^\/explore\/([a-f0-9]{24})$/.exec(url.pathname);
 if (!match) return result('path');
 if (value.split('?')[0] !== `https://www.xiaohongshu.com/explore/${match[1]}`) return result('components');
 if (url.search.includes('&amp;')) return result('escaped');
 const keys = [...url.searchParams.keys()];
 if (!keys.includes('xsec_token')) return result('reference');
 if (!keys.includes('xsec_source')) return result('source');
 // Only the exact, observed navigation marker is removable. Encoded aliases,
 // duplicates, unknown values and all other extra parameters remain rejected.
 const marker = 'source=web_explore_feed';
 const hasPageSource = keys.length === 3 && new Set(keys).size === 3 &&
  keys.includes('source') && value.split('?')[1]?.split('&').includes(marker);
 if (!hasPageSource && (keys.length !== 2 || new Set(keys).size !== 2)) return result('parameters');
 const token = url.searchParams.get('xsec_token') || '';
 if (token.length > 4096 || !/^[A-Za-z0-9_+\/=-]+$/.test(token)) return result('token');
 if (!['pc_feed', 'pc_search'].includes(url.searchParams.get('xsec_source') || '')) return result('sourceValue');
 return result('valid');
}

// Sensitive request material: keep in memory only, never persist or log it.
// Preserve every original access-parameter byte; do not decode/re-encode tokens.
export function singlePostRequestUrl(input: string): string | undefined {
 if (!inspectSinglePostLink(input).valid) return undefined;
 const value = input.trim(), boundary = value.indexOf('?');
 return value.slice(0, boundary + 1) + value.slice(boundary + 1).split('&')
  .filter(part => part !== 'source=web_explore_feed').join('&');
}
