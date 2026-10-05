import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { shell, snapshot, pause, login, tapLabel, fillLabel, capture } from "./native-android-controls";
let stage = "initialization";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirst({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } }); assert.ok(workspace);
  const run = randomUUID(), projectId = `000-native-${run}`, email = `tasks-native-${run}@example.test`, password = randomBytes(24).toString("hex");
  const user: { id: string } = await prisma.user.create({ data: { email, name: "Prueba tareas Android", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "ADMIN", active: true } } }, select: { id: true } });
  try {
    await prisma.project.create({ data: { id: projectId, title: "Proyecto-prueba-Android", slug: `native-task-${run}`,
      terraqoWorkspaceId: workspace.id, summary: "Prueba temporal", description: "Prueba temporal", servicesApplied: [], isPublic: false } });
    for (const serial of ["emulator-5554", "emulator-5556"]) {
      stage = `${serial}: login`; await login(serial, email, password);
      stage = `${serial}: tasks`; await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Tareas"); await tapLabel(serial, "Nuevo registro");
      stage = `${serial}: project picker`; await tapLabel(serial, "Sin seleccionar, Elegir proyecto");
      stage = `${serial}: project selection`; await tapLabel(serial, "Proyecto-prueba-Android");
      const title = serial === "emulator-5554" ? "Tarea-celular" : "Tarea-tablet";
      stage = `${serial}: title`; await fillLabel(serial, "Título", title);
      stage = `${serial}: description`; await fillLabel(serial, "Descripción", "Validacion-operativa");
      capture(serial, serial === "emulator-5554" ? "task-editor-phone.png" : "task-editor-tablet.png");
      stage = `${serial}: save`; await tapLabel(serial, "Guardar");
      let tasks: { id: string; status: string }[] = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        tasks = await prisma.task.findMany({ where: { projectId, title }, select: { id: true, status: true } });
        if (tasks.length) break; await pause(800);
      }
      assert.equal(tasks.length, 1); assert.equal(tasks[0].status, "TODO");
      assert.equal(await prisma.activityLog.count({ where: { taskId: tasks[0].id, actorId: user.id, action: "CREATED" } }), 1);
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: logout`; await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      let closed = false;
      for (let attempt = 0; attempt < 10; attempt++) { await pause(600); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) { closed = true; break; } }
      assert.ok(closed); console.log(`PASS native tasks ${serial}: authorized project selection, one persisted task/audit, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-session:${workspace.id}:${user.id}` } }), 0);
  } finally {
    await prisma.activityLog.deleteMany({ where: { actorId: user.id, projectId, terraqoWorkspaceId: workspace.id } });
    await prisma.project.deleteMany({ where: { id: projectId, slug: `native-task-${run}`, terraqoWorkspaceId: workspace.id } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
    await prisma.user.delete({ where: { id: user.id } });
    for (const serial of ["emulator-5554", "emulator-5556"]) shell(serial, "rm -f /sdcard/terraqo-native-test.xml");
    console.log("CLEANUP TASKS: temporary account, project, tasks, audit and grants removed.");
  }
}
main().catch((error: unknown) => { console.error(`Native tasks stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : "Native task control failed; private diagnostics suppressed."); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
