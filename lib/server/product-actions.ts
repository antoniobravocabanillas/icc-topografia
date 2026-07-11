"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSpecifications(value?: string) {
  if (!value) return {};

  return value.split("\n").reduce<Record<string, string>>((acc, line) => {
    const [key, ...rest] = line.split(":");
    if (key?.trim() && rest.length) acc[key.trim()] = rest.join(":").trim();
    return acc;
  }, {});
}

function parseUrlList(value?: string) {
  if (!value) return [];

  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.startsWith("/") || item.startsWith("https://"));
}

function productDataFromForm(formData: FormData) {
  const name = formValue(formData, "name");
  const sku = formValue(formData, "sku");
  const brand = formValue(formData, "brand");
  const summary = formValue(formData, "summary");
  const description = formValue(formData, "description");
  const availability = formValue(formData, "availability");
  const categoryId = formValue(formData, "categoryId");

  if (!name || !sku || !brand || !summary || !description || !availability || !categoryId) {
    throw new Error("Faltan campos obligatorios del producto.");
  }

  const priceValue = formValue(formData, "price");
  const price = priceValue ? new Prisma.Decimal(priceValue) : null;
  const requiresQuote = formData.get("requiresQuote") === "on" || !price;

  return {
    name,
    slug: formValue(formData, "slug") || slugify(name),
    sku,
    brand,
    model: formValue(formData, "model"),
    summary,
    description,
    price,
    stock: Number(formValue(formData, "stock") || 0),
    currency: formValue(formData, "currency") || "USD",
    requiresQuote,
    availability,
    badge: formValue(formData, "badge"),
    technicalSheet: formValue(formData, "technicalSheet"),
    images: parseUrlList(formValue(formData, "images")),
    specifications: parseSpecifications(formValue(formData, "specifications")),
    categoryId
  };
}

export async function createProductAction(formData: FormData) {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
  await prisma.product.create({ data: { ...productDataFromForm(formData), terraqoWorkspaceId } });
  revalidatePath("/tienda");
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

export async function updateProductAction(id: string, formData: FormData) {
  const data = productDataFromForm(formData);
  await prisma.product.update({
    where: { id },
    data
  });
  revalidatePath("/tienda");
  revalidatePath(`/tienda/${data.slug}`);
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

export async function deleteProductAction(id: string) {
  await prisma.product.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/tienda");
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}
