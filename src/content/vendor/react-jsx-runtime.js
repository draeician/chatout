/*
 * Extracted verbatim from content-scripts/content.js (bytes 198530-199247 of commit cced6e2).
 * VENDOR CODE - React core (react-jsx-runtime.production.js). Do not modify. See NOTE.md.
 */
var C2={exports:{}},Tc={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var c3;function v7(){if(c3)return Tc;c3=1;var r=Symbol.for("react.transitional.element"),t=Symbol.for("react.fragment");function i(u,v,w){var A=null;if(w!==void 0&&(A=""+w),v.key!==void 0&&(A=""+v.key),"key"in v){w={};for(var f in v)f!=="key"&&(w[f]=v[f])}else w=v;return v=w.ref,{$$typeof:r,type:u,key:A,ref:v!==void 0?v:null,props:w}}return Tc.Fragment=t,Tc.jsx=i,Tc.jsxs=i,Tc}var f3;function m7(){return f3||(f3=1,C2.exports=v7()),C2.exports}