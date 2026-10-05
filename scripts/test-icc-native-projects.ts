import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { shell, snapshot, pause, login, tapLabel, fillLabel, capture, scroll } from "./native-android-controls";
let stage = 'initialization';
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, 'icc-topografia:20616116313');
  const workspace = await prisma.terraqoWorkspace.findFirst({where: {slug: 'icc-topografia', active: true, deletedAt: null,
    companies: {some: {document: '20616116313', deletedAt: null}}}, select: {id: true}}); assert.ok(workspace);
  const run = randomUUID(), email = `projects-native-${run}@example.test`, password = randomBytes(24).toString('hex');
  const titles = [`Proyecto-celular-${run}`, `Proyecto-tablet-${run}`];
  const user = await prisma.user.create({data: {email, name: 'Prueba proyectos Android', role: 'CUSTOMER', emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
    terraqoMemberships: {create: {workspaceId: workspace.id, role: 'ADMIN', active: true}}}, select: {id: true}});
  try {
    for (const [index, serial] of ['emulator-5554', 'emulator-5556'].entries()) {
      stage = `${serial}: login`; await login(serial, email, password);
      stage = `${serial}: project management`; await tapLabel(serial, 'Proyectos'); await tapLabel(serial, 'Gestionar proyectos'); await tapLabel(serial, 'Crear proyecto');
      stage = `${serial}: project form`; await fillLabel(serial, 'Nombre del proyecto', titles[index]);
      await fillLabel(serial, 'Alcance del proyecto', 'Levantamiento-de-terreno');
      await fillLabel(serial, 'Ubicación', 'Lima'); await fillLabel(serial, 'Servicios', 'GPS');
      for (let i = 0; i < 4; i++) await scroll(serial, true);
      capture(serial, index === 0 ? 'project-editor-phone.png' : 'project-editor-tablet.png');
      stage = `${serial}: create`; await tapLabel(serial, 'Guardar');
      let project: Awaited<ReturnType<typeof prisma.project.findFirst>> = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        project = await prisma.project.findFirst({where: {title: titles[index], terraqoWorkspaceId: workspace.id}});
        if (project) break; await pause(800);
      }
      assert.ok(project); assert.equal(project.isPublic, false); assert.equal(project.isFeatured, false); assert.equal(project.status, 'PLANNING');
      assert.equal(project.clientId, null); assert.deepEqual(project.servicesApplied, ['GPS']);
      assert.equal(await prisma.activityLog.count({where: {projectId: project.id, actorId: user.id, action: 'CREATED'}}), 1);
      stage = `${serial}: edit`; await tapLabel(serial, titles[index]); await fillLabel(serial, 'Especialidad', 'Topografia'); await tapLabel(serial, 'Guardar');
      for (let attempt = 0; attempt < 12; attempt++) {
        project = await prisma.project.findUniqueOrThrow({where: {id: project.id}});
        if (project.category === 'Topografia') break; await pause(800);
      }
      assert.equal(project.category, 'Topografia'); assert.equal(project.isPublic, false);
      assert.equal(await prisma.activityLog.count({where: {projectId: project.id, actorId: user.id, action: 'UPDATED'}}), 1);
      shell(serial, 'input keyevent 4'); await pause(700);
      stage = `${serial}: logout`; await tapLabel(serial, 'Cuenta'); await tapLabel(serial, 'Cerrar sesión');
      let closed = false;
      for (let attempt = 0; attempt < 12; attempt++) { await pause(600); if ((await snapshot(serial)).includes('Ingresar a mi empresa')) {closed = true; break;} }
      assert.ok(closed); console.log(`PASS native projects ${serial}: management navigation, private creation, services, operational edit, one audit per write and logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where: {identifier: `portal-session:${workspace.id}:${user.id}`}}), 0);
  } finally {
    const projects = await prisma.project.findMany({where: {terraqoWorkspaceId: workspace.id, title: {in: titles}, slug: {startsWith: 'portal-'}}, select: {id: true}});
    const ids = projects.map(project => project.id);
    await prisma.activityLog.deleteMany({where: {projectId: {in: ids}, terraqoWorkspaceId: workspace.id, actorId: user.id}});
    await prisma.project.deleteMany({where: {id: {in: ids}, terraqoWorkspaceId: workspace.id, title: {in: titles}}});
    await prisma.verificationToken.deleteMany({where: {identifier: {in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where: {id: user.id}});
    for (const serial of ['emulator-5554', 'emulator-5556']) shell(serial, 'rm -f /sdcard/terraqo-native-test.xml');
    console.log('CLEANUP PROJECTS: temporary account, projects, audit and session grants removed.');
  }
}
main().catch((error: unknown) => {console.error(`Native project stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : 'Native project control failed; private diagnostics suppressed.'); process.exitCode = 1;}).finally(async () => prisma.$disconnect());
