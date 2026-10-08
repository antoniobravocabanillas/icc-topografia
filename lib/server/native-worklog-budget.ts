import "server-only";
import { NativeWorklogOperationError } from "./native-worklog-http";

/** Admission budget, not cancellation of SQL or a hard driver deadline. */
export class NativeWorklogBudget {
  private readonly started: number;
  constructor(private readonly clock: () => number = () => performance.now()) { this.started = clock(); }
  require(allowanceMs = 0) {
    if (this.clock() - this.started + allowanceMs + 2000 >= 50000)
      throw new NativeWorklogOperationError(503);
  }
}
