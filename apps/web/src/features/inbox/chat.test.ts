import {it,expect} from 'vitest';
import {chatOutcome} from './chat-api';
it('does not equate reservation, interruption, unknown or non-submission to sent',()=>{expect(chatOutcome('CONFIRMED')).toBe('已发送');expect(chatOutcome('UNKNOWN')).toContain('勿重发');expect(chatOutcome('INTERRUPTED')).toContain('待核查');for(const s of ['RESERVED','ATTEMPTED','FAILED','NOT_SUBMITTED'])expect(chatOutcome(s)).not.toBe('已发送')});
