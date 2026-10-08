import "server-only";
import { performance } from "node:perf_hooks";
import { EducationEvidenceReservationError } from "./education-evidence-reservation";

export const EDUCATION_UPLOAD_TRANSACTION = { maxWait: 1000, timeout: 7000 } as const;
const TRANSACTION_MS = 8000, STORE_MS = 5000, RESPONSE_MS = 2000;

/** Admission bounds, not driver cancellation guarantees. Construct before HTTP
 * authentication so its elapsed time consumes the same 50s service allowance. */
export class EducationUploadBudget {
  private readonly deadline: number;
  constructor(private readonly clock: () => number = () => performance.now()) {
    this.deadline = clock() + 50_000;
  }
  remaining() { return Math.max(0, this.deadline - this.clock()); }
  require(milliseconds: number) {
    if (this.remaining() < milliseconds) throw new EducationEvidenceReservationError(
      "El envío no pudo confirmarse. Consulta el recibo antes de reintentar con la misma clave.", 503);
  }
  beforeParse() { this.require(10_000 + 3 * TRANSACTION_MS + STORE_MS + RESPONSE_MS); }
  beforeReserve() { this.require(3 * TRANSACTION_MS + STORE_MS + RESPONSE_MS); }
  beforeStore() { this.require(2 * TRANSACTION_MS + STORE_MS + RESPONSE_MS); }
  beforeCommit() { this.require(2 * TRANSACTION_MS + RESPONSE_MS); }
  canFence() { return this.remaining() >= TRANSACTION_MS + RESPONSE_MS; }
  afterTransaction() { this.require(RESPONSE_MS); }

  async store(write: () => Promise<unknown>) {
    this.beforeStore();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The late provider promise has NO commit continuation. Timeout does not
      // cancel physical storage; the durable fence/watch handles later bytes.
      await Promise.race([Promise.resolve().then(write), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EducationEvidenceReservationError(
          "El almacenamiento no confirmó el envío. Consulta el recibo antes de reintentar.", 503)), STORE_MS);
      })]);
      this.beforeCommit();
    } finally { clearTimeout(timer); }
  }
}
