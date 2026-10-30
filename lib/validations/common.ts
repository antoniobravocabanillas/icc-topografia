import { z } from "zod";

export const idSchema = z.object({
  id: z.string().min(1)
});

export const slugParamSchema = z.object({
  slug: z.string().min(1)
});

export const optionalString = z.string().trim().optional().nullable();

export const jsonRecordSchema = z.record(z.string(), z.unknown()).default({});

/** PATCH inputs must not apply creation defaults to omitted fields. Otherwise
 * editing a product name could silently reset stock, price policy or media. */
export function sparseUpdateSchema<T extends z.ZodRawShape>(shape: T) {
  type WithoutDefaults = { [K in keyof T]: T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K] };
  const withoutDefaults = Object.fromEntries(Object.entries(shape).map(([key, field]) => [
    key, field instanceof z.ZodDefault ? field.removeDefault() : field,
  ])) as WithoutDefaults;
  return z.object(withoutDefaults).partial();
}
