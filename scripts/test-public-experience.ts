import assert from "node:assert/strict";
import {simulateAutomation,demoScenarios,type DemoScenario} from "../lib/terraqo/automation-demo";
import {inspectCulqiConfiguration} from "../lib/terraqo/culqi-config";
import {isTrustedSocialImage} from "../lib/terraqo/social-image-policy";

for(const scenario of Object.keys(demoScenarios) as DemoScenario[]){
 assert.equal(simulateAutomation(scenario,true).length,4);
 const rejected=simulateAutomation(scenario,false);
 assert.equal(rejected.length,2);
 assert(!rejected.some(step=>step.title==="Acción simulada"));
}
for(const raw of ["http://127.0.0.1/admin","https://169.254.169.254/latest/meta-data/","https://terraqoglobal.com.attacker.test/image","https://user:pass@terraqoglobal.com/image","https://terraqoglobal.com:8080/image","file:///etc/passwd","https://[::1]/image"]){assert.equal(isTrustedSocialImage(new URL(raw)),false,raw);}
assert.equal(isTrustedSocialImage(new URL("https://terraqoglobal.com/brand/logo.svg")),true);
assert.equal(inspectCulqiConfiguration({}).configured,false);
const testConfig={CULQI_MODE:"test",CULQI_PUBLIC_KEY:"pk_test_example",CULQI_SECRET_KEY:"sk_test_example",CULQI_PROFESSIONAL_PLAN_ID:"pln_test_example",CULQI_WORKSPACE_PLAN_ID:"pln_test_workspace"};
assert.equal(inspectCulqiConfiguration(testConfig).configured,true);
assert.equal(inspectCulqiConfiguration({...testConfig,CULQI_SECRET_KEY:"sk_live_example"}).configured,false);
assert.equal(JSON.stringify(inspectCulqiConfiguration(testConfig)).includes("sk_test"),false);
console.log("PASS: 6 scenario paths; 7 hostile image URLs; trusted image; missing/mixed Culqi configuration; no key disclosure. No database writes or external requests.");
