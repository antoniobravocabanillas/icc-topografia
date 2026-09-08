import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

for (const path of ["plataforma", "producto", "automatizacion", "membresias", "contacto", "privacidad", "terminos", "cv/example"]) {
  const response = middleware(new NextRequest(`https://portal.terraqoglobal.com/${path}?source=nav`));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), `https://terraqoglobal.com/${path}?source=nav`);
}
for (const path of ["brand/terraqo-3/logo-horizontal.svg", "images/logo.png", "fonts/satoshi/satoshi-regular.woff2"]) {
  const response = middleware(new NextRequest(`https://portal.terraqoglobal.com/${path}`));
  assert.equal(response.headers.get("x-middleware-rewrite"), null);
  assert.equal(response.status, 200);
}
for (const path of ["red", "membresia"]) {
  const response = middleware(new NextRequest(`https://portal.terraqoglobal.com/${path}`));
  assert.equal(response.headers.get("x-middleware-rewrite"), `https://portal.terraqoglobal.com/portal/${path}`);
}
console.log("PASS: public destinations, query preservation, logo/assets, private network and membership routing");
