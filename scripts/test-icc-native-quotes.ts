import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../lib/prisma';
import {login,tapLabel,fillLabel,fillLastLabel,capture,scroll,shell,pause,snapshot} from './native-android-controls';
let stage='workspace';
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,'icc-topografia:20616116313');
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:'icc-topografia',active:true,deletedAt:null,companies:{some:{document:'20616116313',deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`000-native-quotes-${run}`,companyName=`Empresa-prueba-${run.slice(0,8)}`,password=randomBytes(24).toString('hex'),email=`native-quotes-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba propuestas Android',role:'CUSTOMER',emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  try{
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:companyName}});
    for(const [index,serial] of ['emulator-5554','emulator-5556'].entries()){
      const device=index===0?'phone':'tablet';stage=`${device}: login`;
      await login(serial,email,password);await tapLabel(serial,'Abrir herramientas');await tapLabel(serial,'Cotizaciones');
      stage=`${device}: create`;await tapLabel(serial,'Crear propuesta');
      await fillLabel(serial,'Nombre del destinatario',`Cliente-${device}`);
      for(let i=0;i<3;i++)await scroll(serial,true);
      await tapLabel(serial,'Seleccionar empresa');await tapLabel(serial,companyName);
      await fillLabel(serial,'Descripción',`Servicio-${device}-uno`);await fillLabel(serial,'Precio unitario','.10');
      await tapLabel(serial,'Agregar línea');await fillLastLabel(serial,'Descripción',`Servicio-${device}-dos`);await fillLastLabel(serial,'Precio unitario','.20');
      await fillLabel(serial,'Impuesto total','.05');await fillLabel(serial,'Tiempo de entrega','Entrega-inicial');
      for(let i=0;i<4;i++)await scroll(serial,true);capture(serial,`quote-editor-${device}.png`);
      await tapLabel(serial,'Guardar borrador');let quote=null;
      for(let i=0;i<15;i++){quote=await prisma.quote.findFirst({where:{companyId,customerName:`Cliente-${device}`},include:{items:{orderBy:{id:'asc'}}}});if(quote)break;await pause(800);}
      assert.ok(quote);assert.equal(quote.items.length,2);assert.equal(quote.total.toFixed(2),'0.35');assert.equal(quote.publicToken,null);
      stage=`${device}: edit`;await tapLabel(serial,quote.number);await fillLabel(serial,'Tiempo de entrega','-confirmada');await tapLabel(serial,'Guardar borrador');
      let edited=false;for(let i=0;i<15;i++){const row=await prisma.quote.findUniqueOrThrow({where:{id:quote.id}});if(row.deliveryTime==='Entrega-inicial-confirmada'){edited=true;break;}await pause(800);}assert.ok(edited);
      stage=`${device}: issue`;await tapLabel(serial,quote.number);await tapLabel(serial,'Enviar propuesta');await tapLabel(serial,'Confirmar');
      let sent=false;for(let i=0;i<15;i++){const row=await prisma.quote.findUniqueOrThrow({where:{id:quote.id}});if(row.status==='SENT'){assert.match(row.publicToken!,/^[a-f0-9]{64}$/);sent=true;break;}await pause(800);}assert.ok(sent);
      await tapLabel(serial,quote.number);for(let i=0;i<4;i++)await scroll(serial,true);capture(serial,`quote-issued-${device}.png`);
      assert.equal(await prisma.sale.count({where:{quoteId:quote.id}}),0);
      shell(serial,'input keyevent 4');await pause(500);shell(serial,'input keyevent 4');await pause(500);shell(serial,'input keyevent 4');await pause(500);
      await tapLabel(serial,'Cuenta');await tapLabel(serial,'Cerrar sesión');
      let closed=false;for(let i=0;i<12;i++){await pause(700);if((await snapshot(serial)).includes('Ingresar a mi empresa')){closed=true;break;}}assert.ok(closed);
      console.log(`PASS native quotations ${device}: two lines, exact amount, draft edit, issuance token, read-only proposal and logout.`);
    }
  }finally{
    const rows=await prisma.quote.findMany({where:{companyId,terraqoWorkspaceId:workspace.id},select:{id:true}}),ids=rows.map(row=>row.id);
    await prisma.notification.deleteMany({where:{terraqoWorkspaceId:workspace.id,href:{in:ids.map(id=>`/admin/cotizaciones?quote=${id}`)}}});
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.commission.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});await prisma.sale.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.quote.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});await prisma.user.delete({where:{id:user.id}});
    for(const serial of ['emulator-5554','emulator-5556'])shell(serial,'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP NATIVE QUOTES: own temporary quotes, company, account, audits and grants removed.');
  }
}
main().catch((error:unknown)=>{console.error(`Native quote stage: ${stage}`);console.error(error instanceof assert.AssertionError?error.message:'Private diagnostics suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
