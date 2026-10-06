import assert from "node:assert/strict";
import {Auth} from "@auth/core";
import {encode} from "next-auth/jwt";
import {randomBytes} from "node:crypto";
async function main() {
  const secret=randomBytes(32).toString("hex"),name="__Secure-authjs.session-token";
  const token=await encode({secret,salt:name,maxAge:60,token:{sub:"synthetic-proxy-account",role:"ADMIN"}});
  const session=async(url:string,secure?:boolean)=>{
    const response=await Auth(new Request(url,{headers:{cookie:`${name}=${token}`}}),{
      secret,basePath:"/api/auth",trustHost:true,providers:[],session:{strategy:"jwt"},useSecureCookies:secure,
      callbacks:{session({session,token}){session.user.id=token.sub!;return session;}}
    });
    return response.json();
  };
  assert.equal((await session("https://admin.example.test/api/auth/session")).user.id,"synthetic-proxy-account");
  assert.equal(await session("http://internal.example.test/api/auth/session"),null);
  assert.equal((await session("http://internal.example.test/api/auth/session",true)).user.id,"synthetic-proxy-account");
  console.log("PASS Auth.js integration: an internal HTTP origin reads the existing secure session when production cookie mode is explicit.");
}
main().catch(()=>{console.error("Secure proxy cookie integration failed; private diagnostics suppressed.");process.exitCode=1;});
