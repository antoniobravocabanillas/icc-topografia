import { z } from "zod";
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const complaintSchema = z
  .object({
    key: z.string().uuid(),
    name: text(2, 180),
    documentType: z.enum(["DNI", "CE", "PASAPORTE", "OTRO"]),
    document: text(3, 30),
    address: text(5, 350),
    email: z.union([z.string().trim().email().max(200), z.literal("")]),
    phone: text(0, 30),
    minor: z.boolean(),
    representative: text(0, 350),
    channel: z.enum(["EMAIL", "POSTAL"]),
    kind: z.enum(["RECLAMO", "QUEJA"]),
    itemType: z.enum(["SERVICIO", "PRODUCTO"]),
    item: text(3, 500),
    amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
    reference: text(0, 100),
    detail: text(10, 5000),
    request: text(3, 3000),
    signature: text(2, 180),
    confirmed: z.literal(true),
    website: z.literal(""),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.channel === "EMAIL" && !v.email)
      c.addIssue({
        code: "custom",
        path: ["email"],
        message: "Indica el correo para recibir la respuesta.",
      });
    if (v.minor && v.representative.length < 5)
      c.addIssue({
        code: "custom",
        path: ["representative"],
        message:
          "Indica nombre, documento y contacto del padre, madre o representante.",
      });
    if (v.documentType === "DNI" && !/^\d{8}$/.test(v.document))
      c.addIssue({
        code: "custom",
        path: ["document"],
        message: "El DNI debe tener 8 dígitos.",
      });
  });
export type ComplaintInput = z.infer<typeof complaintSchema>;
export function complaintDeadline(date: Date) {
  // Calendar day in Peru, excluding weekends and statutory national holidays.
  const day = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)}T12:00:00Z`,
  );
  const fixed = new Set([
    "01-01",
    "05-01",
    "06-07",
    "06-29",
    "07-23",
    "07-28",
    "07-29",
    "08-06",
    "08-30",
    "10-08",
    "11-01",
    "12-08",
    "12-09",
    "12-25",
  ]);
  let count = 0;
  while (count < 15) {
    day.setUTCDate(day.getUTCDate() + 1);
    const y = day.getUTCFullYear();
    const a = y % 19,
      b = Math.floor(y / 100),
      c = y % 100,
      d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easter = new Date(
      Date.UTC(
        y,
        Math.floor((h + l - 7 * m + 114) / 31) - 1,
        ((h + l - 7 * m + 114) % 31) + 1,
        12,
      ),
    );
    const delta = (easter.getTime() - day.getTime()) / 86400000;
    if (
      day.getUTCDay() !== 0 &&
      day.getUTCDay() !== 6 &&
      !fixed.has(day.toISOString().slice(5, 10)) &&
      delta !== 2 &&
      delta !== 3
    )
      count++;
  }
  return new Date(`${day.toISOString().slice(0, 10)}T23:59:59-05:00`);
}
