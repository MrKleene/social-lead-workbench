import {expect,it} from 'vitest';
import {postAccessLabel} from './post-reading-labels';
it('names unknown access without implying review work, preserving actual restrictions',()=>{expect(postAccessLabel('UNKNOWN')).toBe('访问状态未知');expect(postAccessLabel('NORMAL')).toBe('正常');expect(postAccessLabel('UNAVAILABLE')).toBe('不可访问');expect(postAccessLabel('CONFIRMED_DELETED')).toBe('确认已删除');});
