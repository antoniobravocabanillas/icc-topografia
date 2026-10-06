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
  const run=randomUUID(),companyId=`000-native-contacts-${run}`,companyName=`Empresa-prueba-${run.slice(0,8)}`;
  const password=randomBytes(24).toString('hex'),email=`native-contacts-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba contactos Android',role:'CUSTOMER',emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  try {
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:companyName}});
    for(const [index,serial] of ['emulator-5554','emulator-5556'].entries()){
      const device=index===0?'phone':'tablet',name=`Contacto-${device}-${run.slice(0,8)}`;
      stage=`${device}: login`;await login(serial,email,password);await tapLabel(serial,'Abrir herramientas');
      stage=`${device}: contact form`;await tapLabel(serial,'Contactos comerciales');await tapLabel(serial,'Crear contacto');
      await tapLabel(serial,'Sin seleccionar, Elegir empresa');await tapLabel(serial,companyName);
      await fillLabel(serial,'Nombre del contacto',name);await fillLabel(serial,'Cargo','Coordinacion');
      await fillLabel(serial,'Correo del contacto',`${device}-${run}@example.test`);await fillLabel(serial,'Teléfono','123456');
      for(let i=0;i<3;i++)await scroll(serial,true);capture(serial,`contact-editor-${device}.png`);
      await tapLabel(serial,'Guardar');let contact=null;
      for(let attempt=0;attempt<12;attempt++){contact=await prisma.contact.findFirst({where:{companyId,name}});if(contact)break;await pause(800);}
      assert.ok(contact);assert.equal(contact.phone,'123456');assert.equal(contact.isPrimary,false);
      assert.equal(await prisma.activityLog.count({where:{actorId:user.id,contactId:contact.id,action:'CREATED'}}),1);
      shell(serial,'input keyevent 4');await pause(600);shell(serial,'input keyevent 4');await pause(600);
      stage=`${device}: logout`;await tapLabel(serial,'Cuenta');await tapLabel(serial,'Cerrar sesión');
      let closed=false;for(let attempt=0;attempt<12;attempt++){await pause(700);if((await snapshot(serial)).includes('Ingresar a mi empresa')){closed=true;break;}}
      assert.ok(closed);console.log(`PASS native contacts ${device}: company selector, contact creation, preserved primary/access policy, single audit, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where:{identifier:`portal-session:${workspace.id}:${user.id}`}}),0);
  }finally{
    await prisma.activityLog.deleteMany({where:{actorId:user.id,companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.contact.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    for(const serial of ['emulator-5554','emulator-5556'])shell(serial,'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP NATIVE CONTACTS: temporary ICC company, contacts, account, audits and sessions removed.');
  }
}
main().catch((error:unknown)=>{console.error(`Native contacts stage: ${stage}`);console.error(error instanceof assert.AssertionError?error.message:'Private diagnostics suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
