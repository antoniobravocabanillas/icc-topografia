import assert from 'node:assert/strict';
import {sendTransactionalEmail,TransactionalEmailError} from '../lib/server/transactional-email';
async function main(){
 const saved=globalThis.fetch;const env={...process.env};const errors:unknown[]=[];const log=console.error;
 try{
 process.env.RESEND_API_KEY='test-only';process.env.TERRAQO_EMAIL_FROM='test@example.invalid';delete process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED;
 console.error=(...args)=>{errors.push(args);};
 const input={to:'recipient@example.invalid',subject:'test',html:'test',text:'test'};
 globalThis.fetch=async()=>new Response(JSON.stringify({name:'validation_error',message:'private recipient details'}),{status:403});
 await assert.rejects(sendTransactionalEmail(input),(e:unknown)=>e instanceof TransactionalEmailError&&e.providerStatus===403&&e.providerCode==='validation_error');
 assert.equal(JSON.stringify(errors).includes('private recipient'),false);
 globalThis.fetch=async()=>new Response('{}',{status:200});
 await assert.rejects(sendTransactionalEmail(input),TransactionalEmailError);
 globalThis.fetch=async()=>new Response(JSON.stringify({id:'accepted-id'}),{status:200});
 assert.deepEqual(await sendTransactionalEmail(input),{delivered:true,id:'accepted-id'});
 process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED='false';
 globalThis.fetch=async()=>{throw Error('Must not send');};
 assert.deepEqual(await sendTransactionalEmail(input),{delivered:false,reason:'disabled'});
 console.log('PASS: provider rejection, malformed success, safe diagnostics, accepted response and disabled sender');
 }finally{globalThis.fetch=saved;console.error=log;process.env=env;}
}
void main();
