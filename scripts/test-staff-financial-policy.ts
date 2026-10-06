import {Prisma} from "@prisma/client";
import assert from "node:assert/strict";
import {staffFinancialPolicy,staffFixedCommissionCurrency,StaffFinancialPolicyError} from "../lib/server/staff-financial-policy";
const form=(data:Record<string,string>)=>{const result=new FormData();Object.entries(data).forEach(([key,value])=>result.set(key,value));return result;};
const fields={commissionType:"FIXED_AMOUNT",commissionRate:"5",fixedCommission:"7.23",commissionCurrency:"PEN",monthlyGoal:"1000.10"};
const policy=staffFinancialPolicy(form(fields));assert.equal(policy.fixedCommission.toFixed(2),"7.23");assert.equal(policy.monthlyGoal.toFixed(2),"1000.10");assert.equal(policy.commissionCurrency,"PEN");
for(const change of [{commissionCurrency:""},{commissionCurrency:"EUR"},{fixedCommission:"-1"},{fixedCommission:"1.001"},{fixedCommission:"NaN"},{fixedCommission:"1e3"},{commissionRate:"100.01"},{commissionType:"forged"}])
  assert.throws(()=>staffFinancialPolicy(form({...fields,...change})),StaffFinancialPolicyError);
assert.equal(staffFinancialPolicy(form({...fields,fixedCommission:"0",commissionCurrency:""})).fixedCommission.toFixed(2),"0.00");
assert.equal(staffFixedCommissionCurrency({commissionCurrency:"USD"}),"USD");assert.equal(staffFixedCommissionCurrency({commissionCurrency:"usd"}),null);assert.equal(staffFixedCommissionCurrency([]),null);
console.log("PASS: exact staff financial fields, explicit fixed commission currency, strict rates/amounts and malformed policy denial.");

import {commercialMoneyTotals} from "../lib/server/commercial-money";
assert.equal(commercialMoneyTotals([{amount:new Prisma.Decimal("0.10"),currency:"PEN"},{amount:new Prisma.Decimal("0.20"),currency:"PEN"},{amount:new Prisma.Decimal("7.23"),currency:"USD"}]),"PEN 0.30 · USD 7.23");
assert.equal(commercialMoneyTotals([{amount:new Prisma.Decimal("7.23"),currency:null}]),"Moneda pendiente: 1 registros");
console.log("PASS commercial reporting: exact decimal totals and separate currencies.");
