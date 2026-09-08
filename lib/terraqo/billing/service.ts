import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getDefaultModulesForTier } from "@/lib/workspace";
import { authorizeBillingOwner } from "./owner";
import {
  BILLING_TERMS_VERSION,
  CATALOG_VERSION,
  getBillingPlan,
  periodEnd,
  planAmount,
  supportsBillingCycle,
  type BillingCycle,
} from "./catalog";
import { billingMode, BillingError, culqi, providerId } from "./provider";
import type { CheckoutInput } from "./validation";

export async function checkout(
  user: { id: string; email: string; emailVerified: Date | null },
  input: CheckoutInput,
) {
  if (!user.emailVerified) throw new BillingError("VERIFY_EMAIL_FIRST", 403);
  if (input.termsVersion !== BILLING_TERMS_VERSION)
    throw new BillingError("TERMS_CHANGED", 409);
  const mode = billingMode();
  const plan = getBillingPlan(input.planCode);
  if (!plan.monthlyMinor) throw new BillingError("FREE_PLAN_NEEDS_NO_PAYMENT");
  if (!supportsBillingCycle(plan, input.cycle))
    throw new BillingError("PROVIDER_AMOUNT_LIMIT", 409);
  if ((plan.audience === "WORKSPACE") !== Boolean(input.workspaceId))
    throw new BillingError("PLAN_OWNER_MISMATCH");
  const owner = await authorizeBillingOwner(user.id, input.workspaceId);
  const mapping = await prisma.terraqoBillingPlan.findUnique({
    where: {
      code_version_cycle_mode: {
        code: plan.code,
        version: CATALOG_VERSION,
        cycle: input.cycle,
        mode,
      },
    },
  });
  const amount = planAmount(plan, input.cycle);
  if (
    !mapping?.enabled ||
    mapping.amountMinor !== amount ||
    mapping.currency !== "PEN"
  )
    throw new BillingError("PLAN_NOT_READY", 503);
  providerId(input.tokenId, "tkn", mode);
  // Fail closed if a provider-side edit no longer matches the accepted price.
  const providerPlan = (await culqi(`/recurrent/plans/${mapping.providerId}`)).data;
  if (providerPlan.amount !== amount || providerPlan.currency !== "PEN" ||
      providerPlan.interval_unit_time !== (input.cycle === "ANNUAL" ? 4 : 3) ||
      providerPlan.status !== 1)
    throw new BillingError("PLAN_NOT_READY", 503);
  const account = await prisma.terraqoBillingAccount.upsert({
    where: { ownerKey_mode: { ownerKey: owner.ownerKey, mode } },
    create: {
      ownerKey: owner.ownerKey,
      mode,
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      planCode: owner.freeCode,
    },
    update: {},
  });
  const fingerprint = createHash("sha256").update(input.tokenId).digest("hex");
  const attempt = await prisma.$transaction(async (tx) => {
    const existing = await tx.terraqoBillingAttempt.findUnique({
      where: {
        accountId_idempotencyKey: {
          accountId: account.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.planCode !== plan.code ||
        existing.cycle !== input.cycle ||
        existing.tokenFingerprint !== fingerprint
      )
        throw new BillingError("IDEMPOTENCY_CONFLICT", 409);
      if (existing.status !== "NEEDS_3DS" || !input.authentication3DS)
        return { ...existing, claimed: false };
      const claimed = await tx.terraqoBillingAttempt.updateMany({
        where: { id: existing.id, status: "NEEDS_3DS" },
        data: { status: "PROCESSING" },
      });
      return { ...existing, claimed: claimed.count === 1 };
    }
    // Compare-and-set is the concurrency boundary; no external API inside this transaction.
    const locked = await tx.terraqoBillingAccount.updateMany({
      where: {
        id: account.id,
        currentAttemptId: null,
        subscriptionId: null,
        OR: [{ paidThrough: null }, { paidThrough: { lte: new Date() } }],
      },
      data: { status: "PROCESSING" },
    });
    if (!locked.count)
      throw new BillingError("EXISTING_SUBSCRIPTION_OR_PENDING_PAYMENT", 409);
    const created = await tx.terraqoBillingAttempt.create({
      data: {
        accountId: account.id,
        idempotencyKey: input.idempotencyKey,
        tokenFingerprint: fingerprint,
        planCode: plan.code,
        planVersion: CATALOG_VERSION,
        cycle: input.cycle,
        amountMinor: amount,
        providerPlanId: mapping.providerId,
        status: "PROCESSING",
        termsVersion: BILLING_TERMS_VERSION,
        consentedAt: new Date(),
      },
    });
    await tx.terraqoBillingAccount.update({
      where: { id: account.id },
      data: { currentAttemptId: created.id },
    });
    await tx.terraqoBillingAudit.create({
      data: {
        actorId: user.id,
        accountId: account.id,
        action: "CHECKOUT_CONSENT",
        detail: {
          attemptId: created.id,
          plan: plan.code,
          cycle: input.cycle,
          amountMinor: amount,
          terms: BILLING_TERMS_VERSION,
          mode,
        },
      },
    });
    return { ...created, claimed: true };
  },{maxWait:15000,timeout:15000});
  if (!attempt.claimed)
    return {
      accountId: account.id,
      attemptId: attempt.id,
      status: attempt.status,
    };
  try {
    let customerId = account.customerId;
    const email = mode === "test" ? "review@culqi.com" : user.email;
    const token = (await culqi(`/tokens/${input.tokenId}`)).data;
    if (token.email !== email) throw new BillingError("TOKEN_EMAIL_MISMATCH");
    if (!customerId) {
      const customer = (
        await culqi("/customers", "POST", {
          first_name: input.customer.firstName,
          last_name: input.customer.lastName,
          email,
          address: input.customer.address,
          address_city: input.customer.city,
          country_code: input.customer.country,
          phone_number: input.customer.phone,
          metadata: { terraqo_account: account.id },
        })
      ).data;
      customerId = providerId(customer.id, "cus", mode);
      await prisma.terraqoBillingAccount.update({
        where: { id: account.id },
        data: { customerId },
      });
    }
    let cardId = attempt.providerCardId;
    if (!cardId) {
      await prisma.terraqoBillingAttempt.update({
        where: { id: attempt.id },
        data: { stage: "CARD" },
      });
      const card = (
        await culqi("/cards", "POST", {
          customer_id: customerId,
          token_id: input.tokenId,
          validate: true,
          ...(input.authentication3DS
            ? { authentication_3DS: input.authentication3DS }
            : {}),
          metadata: { terraqo_attempt: attempt.id },
        })
      ).data;
      if (card.action_code === "REVIEW") {
        await prisma.terraqoBillingAttempt.update({
          where: { id: attempt.id },
          data: { status: "NEEDS_3DS" },
        });
        return {
          accountId: account.id,
          attemptId: attempt.id,
          status: "NEEDS_3DS",
        };
      }
      cardId = providerId(card.id, "crd", mode);
      await prisma.terraqoBillingAttempt.update({
        where: { id: attempt.id },
        data: { providerCardId: cardId },
      });
    }
    await prisma.terraqoBillingAttempt.update({
      where: { id: attempt.id },
      data: { stage: "SUBSCRIPTION" },
    });
    const result = (
      await culqi("/recurrent/subscriptions/create", "POST", {
        card_id: cardId,
        plan_id: mapping.providerId,
        tyc: true,
        metadata: { terraqo_attempt: attempt.id, terraqo_account: account.id },
      })
    ).data;
    const subscriptionId = providerId(result.id, "sxn", mode);
    await prisma.$transaction([
      prisma.terraqoBillingAttempt.update({
        where: { id: attempt.id },
        data: { providerSubscriptionId: subscriptionId, status: "PENDING" },
      }),
      prisma.terraqoBillingAccount.update({
        where: { id: account.id },
        data: {
          subscriptionId,
          status: "PENDING",
          planCode: plan.code,
          cycle: input.cycle,
          nextReconcileAt: new Date(),
        },
      }),
    ]);
    await reconcileAccount(account.id);
    return {
      accountId: account.id,
      attemptId: attempt.id,
      status: (
        await prisma.terraqoBillingAccount.findUniqueOrThrow({
          where: { id: account.id },
        })
      ).status,
    };
  } catch (error) {
    const safe =
      error instanceof BillingError
        ? error
        : new BillingError("PAYMENT_UNCERTAIN", 503, true);
    const current = await prisma.terraqoBillingAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    // If subscription submission may have succeeded, never clear the lock or resubmit.
    const uncertain = safe.uncertain || Boolean(current.providerSubscriptionId);
    await prisma.$transaction([
      prisma.terraqoBillingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: uncertain ? "UNCERTAIN" : "FAILED",
          errorCode: safe.code,
        },
      }),
      prisma.terraqoBillingAccount.update({
        where: { id: account.id },
        data: {
          status: uncertain ? "UNCERTAIN" : "FREE",
          ...(uncertain
            ? { nextReconcileAt: new Date() }
            : { currentAttemptId: null }),
        },
      }),
    ]);
    throw safe;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function unix(value: unknown): Date | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function reconcileAccount(accountId: string) {
  let account = await prisma.terraqoBillingAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  if (account.mode !== billingMode())
    throw new BillingError("BILLING_ENVIRONMENT_MISMATCH", 409);
  if (!account.subscriptionId) {
    if (!account.currentAttemptId) return;
    const orphan = await prisma.terraqoBillingAttempt.findUnique({
      where: { id: account.currentAttemptId },
    });
    if (!orphan || orphan.stage !== "SUBSCRIPTION") return;
    // A timed-out POST is never replayed. Recover only a provider-owned record with our exact reference.
    const list = (
      await culqi(
        `/recurrent/subscriptions?plan_id=${encodeURIComponent(orphan.providerPlanId)}&limit=100`,
      )
    ).data;
    const matches = (Array.isArray(list.data) ? list.data : [])
      .map(object)
      .filter(
        (row) =>
          object(row.metadata).terraqo_attempt === orphan.id &&
          object(row.metadata).terraqo_account === accountId,
      );
    if (matches.length !== 1) return;
    const recovered = providerId(
      matches[0].id,
      "sxn",
      account.mode as "test" | "live",
    );
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.terraqoBillingAccount.updateMany({
        where: {
          id: accountId,
          updatedAt: account.updatedAt,
          subscriptionId: null,
          currentAttemptId: orphan.id,
        },
        data: {
          subscriptionId: recovered,
          planCode: orphan.planCode,
          cycle: orphan.cycle,
          status: "PENDING",
        },
      });
      if (!claimed.count) return;
      await tx.terraqoBillingAttempt.update({
        where: { id: orphan.id },
        data: { providerSubscriptionId: recovered, status: "PENDING" },
      });
      await tx.terraqoBillingAudit.create({
        data: {
          accountId,
          action: "SUBSCRIPTION_RECOVERED",
          detail: { attemptId: orphan.id },
        },
      });
    });
    account = await prisma.terraqoBillingAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (!account.subscriptionId) return;
  }
  const data = (
    await culqi(`/recurrent/subscriptions/${account.subscriptionId}`)
  ).data;
  if (data.id !== account.subscriptionId)
    throw new BillingError("SUBSCRIPTION_ID_MISMATCH", 502);
  const attempt = await prisma.terraqoBillingAttempt.findFirst({
    where: { accountId, providerSubscriptionId: account.subscriptionId },
  });
  if (!attempt || object(data.plan).plan_id !== attempt.providerPlanId)
    throw new BillingError("SUBSCRIPTION_PLAN_MISMATCH", 502);
  const expected = attempt.amountMinor;
  const periods = Array.isArray(data.periods) ? data.periods : [];
  const evidence: { id: string; paidAt: Date; end: Date; refunded: number }[] =
    [];
  for (const period of periods) {
    const charges = object(period).charges;
    if (!Array.isArray(charges)) continue;
    for (const value of charges) {
      const charge = object(value);
      if (charge.charger_status !== 1) continue;
      const id = providerId(
        charge.charge_id,
        "chr",
        account.mode as "test" | "live",
      );
      // A webhook/browser or subscription status alone is never payment evidence.
      const verified = (await culqi(`/charges/${id}`)).data;
      if (
        verified.id !== id ||
        verified.amount !== expected ||
        verified.currency_code !== "PEN" ||
        object(verified.outcome).type !== "venta_exitosa" ||
        verified.capture !== true
      )
        continue;
      const paidAt = unix(verified.creation_date);
      if (!paidAt || paidAt.getTime() > Date.now() + 300000) continue;
      const end = periodEnd(paidAt, attempt.cycle as BillingCycle);
      const refunded = Number(verified.amount_refunded || 0);
      if (
        !Number.isSafeInteger(refunded) ||
        refunded < 0 ||
        refunded > expected
      )
        throw new BillingError("INVALID_REFUND_AMOUNT", 502);
      evidence.push({ id, paidAt, end, refunded });
    }
  }
  await prisma.$transaction(async (tx) => {
    // Optimistic fence: a concurrent cancellation/reconciliation invalidates this whole snapshot.
    const fence = await tx.terraqoBillingAccount.updateMany({
      where: {
        id: accountId,
        updatedAt: account.updatedAt,
        subscriptionId: account.subscriptionId,
      },
      data: { lastReconciledAt: new Date() },
    });
    if (!fence.count) return;
    for (const payment of evidence) {
      const existing = await tx.terraqoBillingPayment.findUnique({
        where: { providerChargeId: payment.id },
      });
      if (
        existing &&
        (existing.accountId !== accountId || existing.amountMinor !== expected)
      )
        throw new BillingError("PAYMENT_OWNERSHIP_CONFLICT", 409);
      await tx.terraqoBillingPayment.upsert({
        where: { providerChargeId: payment.id },
        create: {
          accountId,
          providerChargeId: payment.id,
          amountMinor: expected,
          paidAt: payment.paidAt,
          periodEnd: payment.end,
          refundedMinor: payment.refunded,
        },
        update: {
          refundedMinor: Math.max(
            existing?.refundedMinor || 0,
            payment.refunded,
          ),
        },
      });
    }
    const payments = await tx.terraqoBillingPayment.findMany({
      where: { accountId },
      orderBy: { periodEnd: "desc" },
    });
    const paidThrough =
      payments.find((payment) => payment.refundedMinor < payment.amountMinor)
        ?.periodEnd || null;
    const cancelled =
      data.status === 4 || data.status === 6 || account.cancelAtPeriodEnd;
    const active = Boolean(paidThrough && paidThrough > new Date());
    const status = active
      ? "ACTIVE"
      : cancelled
        ? "CANCELLED"
        : data.status === 3
          ? "PAST_DUE"
          : "PENDING";
    const tier = active ? getBillingPlan(attempt.planCode).tier : "FREE";
    // Do not overwrite a newer subscription with a stale reconciliation result.
    const updated = await tx.terraqoBillingAccount.updateMany({
      where: { id: accountId, subscriptionId: account.subscriptionId },
      data: {
        status,
        paidThrough,
        cancelAtPeriodEnd: cancelled,
        lastReconciledAt: new Date(),
        nextReconcileAt: new Date(Date.now() + 15 * 60000),
        ...(cancelled && !active
          ? { subscriptionId: null, currentAttemptId: null }
          : {}),
      },
    });
    if (!updated.count) return;
    await tx.terraqoBillingAttempt.update({
      where: { id: attempt.id },
      data: { status: active ? "SUCCEEDED" : status },
    });
    // Sandbox ledger never grants production entitlements to a real user/company.
    if (account.mode === "live") {
      if (!account.workspaceId)
        await tx.terraqoProfessionalProfile.update({
          where: { userId: account.userId },
          data: { planTier: tier },
        });
      else {
        const modules = getDefaultModulesForTier(tier);
        await tx.terraqoWorkspaceModule.updateMany({
          where: { workspaceId: account.workspaceId, code: { notIn: modules } },
          data: { active: false, disabledAt: new Date() },
        });
        for (const code of modules)
          await tx.terraqoWorkspaceModule.upsert({
            where: {
              workspaceId_code: { workspaceId: account.workspaceId, code },
            },
            create: {
              workspaceId: account.workspaceId,
              code,
              active: true,
              enabledAt: new Date(),
            },
            update: { active: true, enabledAt: new Date(), disabledAt: null },
          });
        const subscription = await tx.terraqoSubscription.findFirst({
          where: { workspaceId: account.workspaceId },
          orderBy: { createdAt: "desc" },
        });
        if (subscription)
          await tx.terraqoSubscription.update({
            where: { id: subscription.id },
            data: {
              tier,
              status: active ? "ACTIVE" : "CANCELLED",
              renewsAt: paidThrough,
              seats: active ? getBillingPlan(attempt.planCode).seats : 1,
            },
          });
      }
    }
    if (account.status !== status)
      await tx.terraqoBillingAudit.create({
        data: {
          accountId,
          action: "PAYMENT_RECONCILED",
          detail: {
            status,
            mode: account.mode,
            paidThrough: paidThrough?.toISOString() || null,
          },
        },
      });
  },{maxWait:15000,timeout:30000});
}

export async function abandonAuthentication(accountId: string, userId: string) {
  const account = await prisma.terraqoBillingAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  if (account.userId !== userId || account.mode !== billingMode())
    throw new BillingError("ACCOUNT_ACCESS_DENIED", 403);
  await authorizeBillingOwner(userId, account.workspaceId || undefined);
  if (!account.currentAttemptId || account.subscriptionId)
    throw new BillingError("PAYMENT_CANNOT_BE_ABANDONED", 409);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.terraqoBillingAttempt.updateMany({
      where: {
        id: account.currentAttemptId!,
        accountId,
        status: "NEEDS_3DS",
        stage: "CARD",
        providerSubscriptionId: null,
      },
      data: { status: "ABANDONED" },
    });
    if (!claimed.count)
      throw new BillingError("PAYMENT_CANNOT_BE_ABANDONED", 409);
    await tx.terraqoBillingAccount.update({
      where: { id: accountId },
      data: { currentAttemptId: null, status: "FREE" },
    });
    await tx.terraqoBillingAudit.create({
      data: { actorId: userId, accountId, action: "AUTHENTICATION_ABANDONED" },
    });
  });
}

export async function cancelSubscription(accountId: string, userId: string) {
  const account = await prisma.terraqoBillingAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  await authorizeBillingOwner(userId, account.workspaceId || undefined);
  if (account.userId !== userId)
    throw new BillingError("ACCOUNT_ACCESS_DENIED", 403);
  if (!account.subscriptionId || account.cancelAtPeriodEnd) return;
  const claimed = await prisma.terraqoBillingAccount.updateMany({
    where: {
      id: accountId,
      cancelAtPeriodEnd: false,
      status: { not: "CANCEL_REQUESTED" },
    },
    data: { status: "CANCEL_REQUESTED" },
  });
  if (!claimed.count) return;
  try {
    await culqi(`/recurrent/subscriptions/${account.subscriptionId}`, "DELETE");
    await prisma.terraqoBillingAccount.update({
      where: { id: accountId },
      data: { cancelAtPeriodEnd: true, nextReconcileAt: new Date() },
    });
    await prisma.terraqoBillingAudit.create({
      data: { actorId: userId, accountId, action: "RENEWAL_CANCELLED" },
    });
    await reconcileAccount(accountId);
  } catch {
    throw new BillingError("CANCELLATION_PENDING_RECONCILIATION", 503, true);
  }
}
