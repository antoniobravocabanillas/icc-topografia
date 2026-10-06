import {CommissionType,Prisma} from "@prisma/client";
import {z} from "zod";
import {quoteMoneySchema} from "./quote-amounts";

export class StaffFinancialPolicyError extends Error {}
export function staffFixedCommissionCurrency(tools:Prisma.JsonValue):"PEN"|"USD"|null {
  if(!tools || typeof tools!=="object" || Array.isArray(tools))return null;
  return tools.commissionCurrency==="PEN" || tools.commissionCurrency==="USD" ? tools.commissionCurrency : null;
}
const schema=z.object({commissionType:z.nativeEnum(CommissionType),commissionRate:quoteMoneySchema,
  fixedCommission:quoteMoneySchema,monthlyGoal:quoteMoneySchema,commissionCurrency:z.enum(["PEN","USD"]).or(z.literal(""))}).strict();
/** Financial values stay decimal strings until validated and converted to Decimal. */
export function staffFinancialPolicy(form:FormData) {
  const read=(name:string,fallback:string)=>{
    const value=form.get(name);
    if(value!==null && typeof value!=="string")throw new StaffFinancialPolicyError("Formato financiero no válido.");
    return typeof value==="string" ? value.trim() || fallback : fallback;
  };
  const parsed=schema.safeParse({commissionType:read("commissionType","SALE_PERCENTAGE"),commissionRate:read("commissionRate","5"),
    fixedCommission:read("fixedCommission","0"),monthlyGoal:read("monthlyGoal","0"),commissionCurrency:read("commissionCurrency","")});
  if(!parsed.success)throw new StaffFinancialPolicyError("Revisa los importes y la moneda de la comisión.");
  const policy={commissionType:parsed.data.commissionType,commissionRate:new Prisma.Decimal(parsed.data.commissionRate),
    fixedCommission:new Prisma.Decimal(parsed.data.fixedCommission),monthlyGoal:new Prisma.Decimal(parsed.data.monthlyGoal),commissionCurrency:parsed.data.commissionCurrency};
  if(policy.commissionRate.gt(100) || policy.commissionType==="FIXED_AMOUNT" && policy.fixedCommission.gt(0) && !policy.commissionCurrency)
    throw new StaffFinancialPolicyError("Declara la moneda de la comisión fija y una tasa entre 0 y 100.");
  return policy;
}
