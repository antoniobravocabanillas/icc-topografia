import { WorkCaseOrganizer } from "@/components/terraqo/work-case-organizer";

export default function Page() {
  return <WorkCaseOrganizer worklogs={[
    { id: "one", title: "Control de niveles", occurredAt: "2026-10-28T15:00:00Z", workspaceId: "company-a", projectId: "project-a", workCaseId: null, imageHref: "/fixture-1.svg" },
    { id: "two", title: "Replanteo de ejes", occurredAt: "2026-10-29T15:00:00Z", workspaceId: "company-a", projectId: "project-a", workCaseId: null, imageHref: "/fixture-2.svg" },
    { id: "other", title: "Trabajo de otra empresa", occurredAt: "2026-10-29T15:00:00Z", workspaceId: "company-b", projectId: null, workCaseId: null },
  ]} initialCases={[{ id: "case-one", title: "Trabajo agrupado", description: null, version: 7, records: [{ id: "record-one", worklogId: "linked", phase: "RESULT", worklog: { id: "linked", title: "Registro vinculado", occurredAt: "2026-10-28T15:00:00Z" } }] }]} />;
}
