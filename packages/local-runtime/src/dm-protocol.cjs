'use strict';
// Generated policy bundle retains the original typed wire contract and validators.
const policy=require('@crm/local-runtime/policy');
module.exports={PROTOCOL:policy.DM_SEND_PROTOCOL,validateCommand:value=>policy.dmCommandSchema.parse(value),parseDmExecution:policy.parseDmExecution};
