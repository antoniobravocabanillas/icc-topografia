import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../lib/prisma';
import {login,tapLabel,pause,snapshot,capture,shell} from './native-android-controls';
let stage='initialization';
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,'icc-topografia:20616116313');
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:'icc-topografia',active:true,deletedAt:null,
    companies:{some:{document:'20616116313',deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),password=randomBytes(24).toString('hex'),email=`workspace-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba de acceso empresarial',role:'CUSTOMER',emailVerified:new Date(),
    passwordHash:await bcrypt.hash(password,12),terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  const base='https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal';
  const request=(path:string,bearer?:string,body?:unknown)=>fetch(`${base}/${path}`,{method:body?'POST':'GET',
    headers:{'content-type':'application/json',...(bearer?{authorization:`Bearer ${bearer}`}:{})},body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(90000),redirect:'error'});
  try {
    stage='HTTP';
    assert.equal((await request('workspaces')).status,401);
    const logged=await request('login',undefined,{email,password});assert.equal(logged.status,200);
    const original=(await logged.json()).data.token as string;
    const listed=await request('workspaces',original);assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control')?.replace(/\s/g,''),'private,no-store');
    const data=(await listed.json()).data;assert.equal(data.workspaces.length,1);assert.equal(data.nextCursor,null);
    assert.equal(data.workspaces[0].slug,'icc-topografia');assert.equal(data.workspaces[0].current,true);
    assert.deepEqual(Object.keys(data.workspaces[0]).sort(),['current','name','role','slug']);
    assert.equal((await request('workspaces?cursor=../x',original)).status,422);
    assert.equal((await request('workspaces',original,{workspaceSlug:'foreign-unavailable'})).status,403);
    assert.equal((await request('workspaces',original,{workspaceSlug:'icc-topografia',role:'ADMIN'})).status,422);
    const switched=await request('workspaces',original,{workspaceSlug:'icc-topografia'});assert.equal(switched.status,200);
    const next=(await switched.json()).data.token as string;assert.notEqual(next,original);
    assert.equal((await request('session',next)).status,200);
    assert.equal((await request('logout',original,{})).status,200);
    assert.equal((await request('workspaces',original)).status,401);
    assert.equal((await request('session',next)).status,200);
    assert.equal((await request('logout',next,{})).status,200);
    console.log('PASS live workspace access: self-only list, strict input, unauthorized destination, independent new grant, revocation.');
    if(process.env.TEST_NATIVE_WORKSPACES==='1') for(const [index,serial] of ['emulator-5554','emulator-5556'].entries()) {
      stage=index===0?'native phone':'native tablet';await login(serial,email,password);
      await tapLabel(serial,'Cuenta');await tapLabel(serial,'Cambiar de empresa');
      let ready=false;
      for(let attempt=0;attempt<12;attempt++){await pause(700);if((await snapshot(serial)).includes('Empresa actual')){ready=true;break;}}
      assert.ok(ready);capture(serial,`workspace-chooser-${index===0?'phone':'tablet'}.png`);
      shell(serial,'input keyevent 4');await pause(700);await tapLabel(serial,'Cerrar sesión');
      let closed=false;for(let attempt=0;attempt<12;attempt++){await pause(700);if((await snapshot(serial)).includes('Ingresar a mi empresa')){closed=true;break;}}
      assert.ok(closed);console.log(`PASS ${stage}: authorized company displayed, current marker, return, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where:{identifier:`portal-session:${workspace.id}:${user.id}`}}),0);
  } finally {
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,
      `portal-login-attempt:${workspace.id}:${user.id}`,`portal-switch-attempt:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    for(const serial of ['emulator-5554','emulator-5556']) shell(serial,'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP WORKSPACES: temporary ICC account, grants and rate markers removed.');
  }
}
main().catch((error:unknown)=>{console.error(`Workspace stage: ${stage}`);console.error(error instanceof assert.AssertionError?error.message:'Private diagnostics suppressed.');process.exitCode=1;}).finally(async()=>prisma.$disconnect());
