import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../lib/prisma';
import {shell, snapshot, pause, login, tapLabel, fillLabel, capture, scroll} from './native-android-controls';
let stage = 'initialization';
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, 'icc-topografia:20616116313');
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({where: {slug: 'icc-topografia', active: true, deletedAt: null,
    companies: {some: {document: '20616116313', deletedAt: null}}}, select: {id: true}});
  const run = randomUUID(), password = randomBytes(24).toString('hex'), email = `native-operations-${run}@example.test`;
  const projectId = `000-native-operations-${run}`, staffId = `000-native-staff-${run}`;
  const projectName = `Obra-prueba-${run.slice(0,8)}`, staffName = `Equipo-prueba-${run.slice(0,8)}`;
  const user = await prisma.user.create({data: {email, name: 'Prueba de operaciones', role: 'CUSTOMER', emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password,12), terraqoMemberships: {create: {workspaceId: workspace.id, role: 'ADMIN', active: true}}}, select: {id: true}});
  try {
    await prisma.project.create({data: {id: projectId, terraqoWorkspaceId: workspace.id, title: projectName, slug: `native-operations-${run}`,
      summary: 'Prueba temporal', description: '', servicesApplied: [], isPublic: false}});
    await prisma.staffProfile.create({data: {id: staffId, terraqoWorkspaceId: workspace.id, displayName: staffName, roleTitle: 'Topografía',
      certifications: [], documents: [], specialties: [], tools: {}, active: true}});
    for (const [index, serial] of ['emulator-5554','emulator-5556'].entries()) {
      const device = index === 0 ? 'phone' : 'tablet';
      stage = `${device}: login`; await login(serial,email,password);
      await tapLabel(serial,'Abrir herramientas');
      stage = `${device}: team`; await tapLabel(serial,'Equipo de proyectos'); await tapLabel(serial,'Añadir al equipo');
      await tapLabel(serial,'Sin seleccionar, Elegir proyecto'); await tapLabel(serial,projectName);
      await tapLabel(serial,'Sin responsable, Elegir responsable'); await tapLabel(serial,staffName);
      for (let i=0;i<3;i++) await scroll(serial,true);
      capture(serial,`project-team-${device}.png`); await tapLabel(serial,'Guardar');
      let team = null;
      for (let attempt=0;attempt<12;attempt++) {team = await prisma.projectMember.findFirst({where: {projectId,staffProfileId:staffId}}); if(team) break; await pause(800);}
      assert.ok(team); assert.equal(team.role,'SURVEYOR');
      // Each device exercises creation independently against a fresh assignment.
      await prisma.projectMember.delete({where:{id:team.id}});
      shell(serial,'input keyevent 4'); await pause(600);
      stage = `${device}: milestone`; await tapLabel(serial,'Hitos'); await tapLabel(serial,'Crear hito');
      await tapLabel(serial,'Sin seleccionar, Elegir proyecto'); await tapLabel(serial,projectName);
      const title = `Entrega-${device}-${run.slice(0,8)}`;
      await fillLabel(serial,'Nombre del hito',title); await fillLabel(serial,'Criterio de entrega','Planos-revisados');
      for (let i=0;i<3;i++) await scroll(serial,true);
      capture(serial,`project-milestone-${device}.png`); await tapLabel(serial,'Guardar');
      let milestone = null;
      for(let attempt=0;attempt<12;attempt++){milestone=await prisma.milestone.findFirst({where:{projectId,title}});if(milestone)break;await pause(800);}
      assert.ok(milestone); assert.equal(milestone.status,'PENDING');
      shell(serial,'input keyevent 4'); await pause(600);
      stage = `${device}: progress`; await tapLabel(serial,'Avances de proyectos'); await tapLabel(serial,'Registrar avance');
      await tapLabel(serial,'Sin seleccionar, Elegir proyecto'); await tapLabel(serial,projectName);
      const progressTitle = `Campo-${device}-${run.slice(0,8)}`;
      await fillLabel(serial,'Título del avance',progressTitle); await fillLabel(serial,'Trabajo realizado','Medicion-de-terreno-completada');
      for(let i=0;i<3;i++) await scroll(serial,true);
      capture(serial,`project-progress-${device}.png`); await tapLabel(serial,'Guardar');
      let progress = null;
      for(let attempt=0;attempt<12;attempt++){progress=await prisma.projectProgress.findFirst({where:{projectId,title:progressTitle}});if(progress)break;await pause(800);}
      assert.ok(progress); assert.equal(progress.body,'Medicion-de-terreno-completada');
      for(const [entityType,entityId] of [['projectMembers',team.id],['milestones',milestone.id],['projectProgress',progress.id]])
        assert.equal(await prisma.activityLog.count({where:{actorId:user.id,projectId,entityType,entityId,action:'CREATED'}}),1);
      shell(serial,'input keyevent 4'); await pause(500); shell(serial,'input keyevent 4'); await pause(500);
      stage = `${device}: logout`; await tapLabel(serial,'Cuenta'); await tapLabel(serial,'Cerrar sesión');
      let closed=false; for(let attempt=0;attempt<12;attempt++){await pause(600);if((await snapshot(serial)).includes('Ingresar a mi empresa')){closed=true;break;}}
      assert.ok(closed); console.log(`PASS native operations ${device}: team, milestone, immutable progress, one audit each, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where:{identifier:`portal-session:${workspace.id}:${user.id}`}}),0);
  } finally {
    await prisma.activityLog.deleteMany({where:{projectId,terraqoWorkspaceId:workspace.id,actorId:user.id}});
    await prisma.project.deleteMany({where:{id:projectId,terraqoWorkspaceId:workspace.id,slug:`native-operations-${run}`}});
    await prisma.staffProfile.deleteMany({where:{id:staffId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    for(const serial of ['emulator-5554','emulator-5556']) shell(serial,'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP NATIVE OPERATIONS: temporary project, staff, account, operations, audits and grants removed.');
  }
}
main().catch((error:unknown)=>{console.error(`Native operations stage: ${stage}`);console.error(error instanceof assert.AssertionError?error.message:'Native operations failed; private diagnostics suppressed.');process.exitCode=1;}).finally(async()=>prisma.$disconnect());
