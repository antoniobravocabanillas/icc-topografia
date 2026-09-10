import { z } from "zod";
import { getCountryOptions } from "@/lib/locations";
const countries = new Set(getCountryOptions().map(option => option.value));
export const checkoutSchema=z.object({
  planCode:z.string().max(50),cycle:z.enum(["MONTHLY","ANNUAL"]),workspaceId:z.string().cuid().optional(),
  idempotencyKey:z.string().uuid(),tokenId:z.string().regex(/^tkn_(test|live)_[A-Za-z0-9]+$/),
  consent:z.literal(true),termsVersion:z.string().max(30),
  customer:z.object({firstName:z.string().min(2).max(50).regex(/^[\p{L} ]+$/u),lastName:z.string().min(2).max(50).regex(/^[\p{L} ]+$/u),address:z.string().min(5).max(100),city:z.string().min(2).max(30),country:z.string().length(2).refine(value=>countries.has(value),"País no válido"),phone:z.string().regex(/^\+?[0-9]{5,15}$/)}).strict(),
  authentication3DS:z.object({eci:z.string().max(10),xid:z.string().max(500),cavv:z.string().max(500),protocolVersion:z.string().max(20),directoryServerTransactionId:z.string().max(100)}).strict().optional(),
}).strict();
export type CheckoutInput=z.infer<typeof checkoutSchema>;
