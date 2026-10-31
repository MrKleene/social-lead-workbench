import {expect,it} from 'vitest';
import {accountReadyForRule} from './account-ready';
const a:any={isDemo:false,healthy:false,dailyLimit:3,canCheck:true,workbenchStatus:'PAUSED',systemBlockReason:null,sendEligibility:{state:'UNKNOWN',canSend:false,stale:true}};
it('saved-session qualification permits rule consent, never equates login to sending',()=>{expect(accountReadyForRule(a,'REAL')).toBe(true);expect(a.sendEligibility.canSend).toBe(false);});
it.each([{systemBlockReason:'historical restriction'},{dailyLimit:0},{isDemo:true},{canCheck:false}])('blocks unavailable or restricted account %j',patch=>{expect(accountReadyForRule({...a,...patch},'REAL')).toBe(false);});
