import assert from "node:assert/strict";

export function confirmedLocalDisposableDatabaseUrl(input: {
  value?: string;
  expected?: string;
  valueVariable: string;
  expectedVariable: string;
}) {
  const value = input.value?.trim();
  const expected = input.expected?.trim();
  assert.ok(value, `Define ${input.valueVariable} con una copia local desechable.`);
  assert.ok(expected, `Define ${input.expectedVariable} para confirmar el destino.`);
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/, "El gate solo admite PostgreSQL.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "El gate mutante solo puede ejecutarse contra localhost.");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  assert.equal(databaseName, expected, `La base no coincide con ${input.expectedVariable}.`);
  assert.match(expected, /(?:gate|test|disposable)/i, "El nombre de la base debe declarar que es desechable.");
  return value;
}
