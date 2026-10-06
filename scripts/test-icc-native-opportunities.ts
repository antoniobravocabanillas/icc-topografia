import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../lib/prisma';
import {login,tapLabel,fillLabel,capture,scroll,shell,pause,snapshot} from './native-android-controls';
let stage='initialization';
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,'icc-topografia:20616116313');
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:'icc-topografia',active:true,deletedAt:null,
    companies:{some:{document:'20616116313',deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`000-native-opportunities-${run}`,companyName=`Empresa-prueba-${run.slice(0,8)}`;
  const password=randomBytes(24).toString('hex'),email=`native-opportunities-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba oportunidades Android',role:'CUSTOMER',emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  try {
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:companyName}});
    for(const [index,serial] of ['emulator-5554','emulator-5556'].entries()){
      const device=index===0?'phone':'tablet',name=`Oportunidad-${device}-${run.slice(0,8)}`;
      stage=`${device}: login`;await login(serial,email,password);await tapLabel(serial,'Abrir herramientas');
      stage=`${device}: contact form`;await tapLabel(serial,'Oportunidades');await tapLabel(serial,'Crear oportunidad');
      await tapLabel(serial,'Sin seleccionar, Elegir empresa');await tapLabel(serial,companyName);
      await fillLabel(serial,'Título de la oportunidad',name);await fillLabel(serial,'Próximo paso','Coordinar-visita');
      await fillLabel(serial,'Fecha de seguimiento','2026-10-15');
      for(let i=0;i<3;i++)await scroll(serial,true);capture(serial,`opportunity-editor-${device}.png`);
      await tapLabel(serial,'Guardar');let opportunity=null;
      for(let attempt=0;attempt<12;attempt++){opportunity=await prisma.opportunity.findFirst({where:{companyId,title:name}});if(opportunity)break;await pause(800);}
      assert.ok(opportunity);assert.equal(opportunity.probability,25);assert.equal(opportunity.estimatedValue,null);assert.equal(opportunity.nextFollowUpAt?.toISOString().slice(0,10),'2026-10-15');
      assert.equal(await prisma.activityLog.count({where:{actorId:user.id,opportunityId:opportunity.id,action:'CREATED'}}),1);
      stage=`${device}: contact edit`;await tapLabel(serial,name);
      await fillLabel(serial,'Próximo paso','-confirmada');
      for(let i=0;i<3;i++)await scroll(serial,true);capture(serial,`opportunity-edit-${device}.png`);
      await tapLabel(serial,'Guardar');let edited=false;
      for(let attempt=0;attempt<12;attempt++){const current=await prisma.opportunity.findUniqueOrThrow({where:{id:opportunity.id}});
        if(current.nextStep==='Coordinar-visita-confirmada'){assert.equal(current.companyId,companyId);assert.equal(current.estimatedValue,null);edited=true;break;}await pause(800);}
      assert.ok(edited);assert.equal(await prisma.activityLog.count({where:{actorId:user.id,opportunityId:opportunity.id,action:'UPDATED'}}),1);
      shell(serial,'input keyevent 4');await pause(600);shell(serial,'input keyevent 4');await pause(600);
      stage=`${device}: logout`;await tapLabel(serial,'Cuenta');await tapLabel(serial,'Cerrar sesión');
      let closed=false;for(let attempt=0;attempt<12;attempt++){await pause(700);if((await snapshot(serial)).includes('Ingresar a mi empresa')){closed=true;break;}}
      assert.ok(closed);console.log(`PASS native opportunities ${device}: company selector, creation/edit, follow-up date/probability, preserved company/financial relations, single audit per write, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where:{identifier:`portal-session:${workspace.id}:${user.id}`}}),0);
  }finally{
    await prisma.activityLog.deleteMany({where:{actorId:user.id,companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.opportunity.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    for(const serial of ['emulator-5554','emulator-5556'])shell(serial,'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP NATIVE OPPORTUNITIES: temporary ICC company, opportunities, account, audits and sessions removed.');
  }
}
main().catch((error:unknown)=>{console.error(`Native opportunities stage: ${stage}`);console.error(error instanceof assert.AssertionError?error.message:'Private diagnostics suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
