/*
 * Extracted verbatim from content-scripts/content.js (bytes 211316-214385 of commit cced6e2),
 * with one trailing semicolon added to close out its own const statement cleanly.
 * The original bundle joined this last icons declaration with the start of an
 * unrelated app-level constant (PA = toast styling config) via a shared comma-separated
 * const statement - PA stays in content.js for now (Phase 3 app-logic territory), split
 * out here the same way the react-dom-client/scheduler cache-var split was handled.
 * VENDOR CODE - lucide-react v0.539.0 icons (8 icon components actually used by the app,
 * tree-shaken from the full library). Do not modify. See NOTE.md.
 */
/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oB=r=>r.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),uB=r=>r.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,i,u)=>u?u.toUpperCase():i.toLowerCase()),y3=r=>{const t=uB(r);return t.charAt(0).toUpperCase()+t.slice(1)},b3=(...r)=>r.filter((t,i,u)=>!!t&&t.trim()!==""&&u.indexOf(t)===i).join(" ").trim(),lB=r=>{for(const t in r)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var cB={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fB=ur.forwardRef(({color:r="currentColor",size:t=24,strokeWidth:i=2,absoluteStrokeWidth:u,className:v="",children:w,iconNode:A,...f},e)=>ur.createElement("svg",{ref:e,...cB,width:t,height:t,stroke:r,strokeWidth:u?Number(i)*24/Number(t):i,className:b3("lucide",v),...!w&&!lB(f)&&{"aria-hidden":"true"},...f},[...A.map(([o,s])=>ur.createElement(o,s)),...Array.isArray(w)?w:[w]]));/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const kA=(r,t)=>{const i=ur.forwardRef(({className:u,...v},w)=>ur.createElement(fB,{ref:w,iconNode:t,className:b3(`lucide-${oB(y3(r))}`,`lucide-${r}`,u),...v}));return i.displayName=y3(r),i};/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const AB=kA("circle-check",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w3=kA("external-link",[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]);/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const hB=kA("info",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]]);/**
 * @license lucide-react v0.539.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dB=kA("x",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);