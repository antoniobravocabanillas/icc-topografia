export type StaffPolicyState = {
  status: "idle" | "saved" | "review" | "conflict";
  message: string;
  submissionId?: string;
  version?: string;
};
export const initialStaffPolicyState: StaffPolicyState = {status: "idle", message: ""};
