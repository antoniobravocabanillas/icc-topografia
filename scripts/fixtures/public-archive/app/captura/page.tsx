import { WorklogComposer } from "@/components/terraqo/worklog-composer";
export default function Page() {
  return <main className="mx-auto max-w-5xl p-4"><WorklogComposer draftOwnerKey="s03-synthetic" previousWorklogs={[]} workspaces={[]} /></main>;
}
