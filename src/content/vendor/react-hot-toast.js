/*
 * Extracted verbatim from content-scripts/content.js (bytes 201459-211316 of commit cced6e2).
 * VENDOR CODE - react-hot-toast (toast notification library used for the
 * on-page export-status toast). Ships with no @license header of its own in
 * this bundle - boundary found via content signature (the "data-rht-toaster"
 * DOM attribute, the toast reducer action-type switch, genId counter), not a
 * license comment. Do not modify. See NOTE.md.
 */
var S7=r=>typeof r=="function",UA=(r,t)=>S7(r)?r(t):r,T7=(()=>{let r=0;return()=>(++r).toString()})(),p3=(()=>{let r;return()=>{if(r===void 0&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");r=!t||t.matches}return r}})(),F7=20,F2="default",g3=(r,t)=>{let{toastLimit:i}=r.settings;switch(t.type){case 0:return{...r,toasts:[t.toast,...r.toasts].slice(0,i)};case 1:return{...r,toasts:r.toasts.map(A=>A.id===t.toast.id?{...A,...t.toast}:A)};case 2:let{toast:u}=t;return g3(r,{type:r.toasts.find(A=>A.id===u.id)?1:0,toast:u});case 3:let{toastId:v}=t;return{...r,toasts:r.toasts.map(A=>A.id===v||v===void 0?{...A,dismissed:!0,visible:!1}:A)};case 4:return t.toastId===void 0?{...r,toasts:[]}:{...r,toasts:r.toasts.filter(A=>A.id!==t.toastId)};case 5:return{...r,pausedAt:t.time};case 6:let w=t.time-(r.pausedAt||0);return{...r,pausedAt:void 0,toasts:r.toasts.map(A=>({...A,pauseDuration:A.pauseDuration+w}))}}},NA=[],v3={toasts:[],pausedAt:void 0,settings:{toastLimit:F7}},ao={},m3=(r,t=F2)=>{ao[t]=g3(ao[t]||v3,r),NA.forEach(([i,u])=>{i===t&&u(ao[t])})},x3=r=>Object.keys(ao).forEach(t=>m3(r,t)),R7=r=>Object.keys(ao).find(t=>ao[t].toasts.some(i=>i.id===r)),DA=(r=F2)=>t=>{m3(t,r)},O7={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},I7=(r={},t=F2)=>{let[i,u]=ur.useState(ao[t]||v3),v=ur.useRef(ao[t]);ur.useEffect(()=>(v.current!==ao[t]&&u(ao[t]),NA.push([t,u]),()=>{let A=NA.findIndex(([f])=>f===t);A>-1&&NA.splice(A,1)}),[t]);let w=i.toasts.map(A=>{var f,e,o;return{...r,...r[A.type],...A,removeDelay:A.removeDelay||((f=r[A.type])==null?void 0:f.removeDelay)||(r==null?void 0:r.removeDelay),duration:A.duration||((e=r[A.type])==null?void 0:e.duration)||(r==null?void 0:r.duration)||O7[A.type],style:{...r.style,...(o=r[A.type])==null?void 0:o.style,...A.style}}});return{...i,toasts:w}},U7=(r,t="blank",i)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:r,pauseDuration:0,...i,id:(i==null?void 0:i.id)||T7()}),Fc=r=>(t,i)=>{let u=U7(t,r,i);return DA(u.toasterId||R7(u.id))({type:2,toast:u}),u.id},ja=(r,t)=>Fc("blank")(r,t);ja.error=Fc("error"),ja.success=Fc("success"),ja.loading=Fc("loading"),ja.custom=Fc("custom"),ja.dismiss=(r,t)=>{let i={type:3,toastId:r};t?DA(t)(i):x3(i)},ja.dismissAll=r=>ja.dismiss(void 0,r),ja.remove=(r,t)=>{let i={type:4,toastId:r};t?DA(t)(i):x3(i)},ja.removeAll=r=>ja.remove(void 0,r),ja.promise=(r,t,i)=>{let u=ja.loading(t.loading,{...i,...i==null?void 0:i.loading});return typeof r=="function"&&(r=r()),r.then(v=>{let w=t.success?UA(t.success,v):void 0;return w?ja.success(w,{id:u,...i,...i==null?void 0:i.success}):ja.dismiss(u),v}).catch(v=>{let w=t.error?UA(t.error,v):void 0;w?ja.error(w,{id:u,...i,...i==null?void 0:i.error}):ja.dismiss(u)}),r};var N7=1e3,D7=(r,t="default")=>{let{toasts:i,pausedAt:u}=I7(r,t),v=ur.useRef(new Map).current,w=ur.useCallback((c,h=N7)=>{if(v.has(c))return;let y=setTimeout(()=>{v.delete(c),A({type:4,toastId:c})},h);v.set(c,y)},[]);ur.useEffect(()=>{if(u)return;let c=Date.now(),h=i.map(y=>{if(y.duration===1/0)return;let d=(y.duration||0)+y.pauseDuration-(c-y.createdAt);if(d<0){y.visible&&ja.dismiss(y.id);return}return setTimeout(()=>ja.dismiss(y.id,t),d)});return()=>{h.forEach(y=>y&&clearTimeout(y))}},[i,u,t]);let A=ur.useCallback(DA(t),[t]),f=ur.useCallback(()=>{A({type:5,time:Date.now()})},[A]),e=ur.useCallback((c,h)=>{A({type:1,toast:{id:c,height:h}})},[A]),o=ur.useCallback(()=>{u&&A({type:6,time:Date.now()})},[u,A]),s=ur.useCallback((c,h)=>{let{reverseOrder:y=!1,gutter:d=8,defaultPosition:m}=h||{},x=i.filter(C=>(C.position||m)===(c.position||m)&&C.height),g=x.findIndex(C=>C.id===c.id),b=x.filter((C,B)=>B<g&&C.visible).length;return x.filter(C=>C.visible).slice(...y?[b+1]:[0,b]).reduce((C,B)=>C+(B.height||0)+d,0)},[i]);return ur.useEffect(()=>{i.forEach(c=>{if(c.dismissed)w(c.id,c.removeDelay);else{let h=v.get(c.id);h&&(clearTimeout(h),v.delete(c.id))}})},[i,w]),{toasts:i,handlers:{updateHeight:e,startPause:f,endPause:o,calculateOffset:s}}},L7=Do`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,M7=Do`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,k7=Do`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,P7=h0("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${r=>r.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${L7} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${M7} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${r=>r.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${k7} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,H7=Do`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,Q7=h0("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${r=>r.secondary||"#e0e0e0"};
  border-right-color: ${r=>r.primary||"#616161"};
  animation: ${H7} 1s linear infinite;
`,z7=Do`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,G7=Do`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,K7=h0("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${r=>r.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${z7} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${G7} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${r=>r.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,V7=h0("div")`
  position: absolute;
`,W7=h0("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,j7=Do`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,X7=h0("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${j7} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Y7=({toast:r})=>{let{icon:t,type:i,iconTheme:u}=r;return t!==void 0?typeof t=="string"?ur.createElement(X7,null,t):t:i==="blank"?null:ur.createElement(W7,null,ur.createElement(Q7,{...u}),i!=="loading"&&ur.createElement(V7,null,i==="error"?ur.createElement(P7,{...u}):ur.createElement(K7,{...u})))},Z7=r=>`
0% {transform: translate3d(0,${r*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,J7=r=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${r*-150}%,-1px) scale(.6); opacity:0;}
`,q7="0%{opacity:0;} 100%{opacity:1;}",$7="0%{opacity:1;} 100%{opacity:0;}",_7=h0("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,eB=h0("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,tB=(r,t)=>{let i=r.includes("top")?1:-1,[u,v]=p3()?[q7,$7]:[Z7(i),J7(i)];return{animation:t?`${Do(u)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${Do(v)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},rB=ur.memo(({toast:r,position:t,style:i,children:u})=>{let v=r.height?tB(r.position||t||"top-center",r.visible):{opacity:0},w=ur.createElement(Y7,{toast:r}),A=ur.createElement(eB,{...r.ariaProps},UA(r.message,r));return ur.createElement(_7,{className:r.className,style:{...v,...i,...r.style}},typeof u=="function"?u({icon:w,message:A}):ur.createElement(ur.Fragment,null,w,A))});C7(ur.createElement);var nB=({id:r,className:t,style:i,onHeightUpdate:u,children:v})=>{let w=ur.useCallback(A=>{if(A){let f=()=>{let e=A.getBoundingClientRect().height;u(r,e)};f(),new MutationObserver(f).observe(A,{subtree:!0,childList:!0,characterData:!0})}},[r,u]);return ur.createElement("div",{ref:w,className:t,style:i},v)},aB=(r,t)=>{let i=r.includes("top"),u=i?{top:0}:{bottom:0},v=r.includes("center")?{justifyContent:"center"}:r.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:p3()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(i?1:-1)}px)`,...u,...v}},iB=IA`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,LA=16,sB=({reverseOrder:r,position:t="top-center",toastOptions:i,gutter:u,children:v,toasterId:w,containerStyle:A,containerClassName:f})=>{let{toasts:e,handlers:o}=D7(i,w);return ur.createElement("div",{"data-rht-toaster":w||"",style:{position:"fixed",zIndex:9999,top:LA,left:LA,right:LA,bottom:LA,pointerEvents:"none",...A},className:f,onMouseEnter:o.startPause,onMouseLeave:o.endPause},e.map(s=>{let c=s.position||t,h=o.calculateOffset(s,{reverseOrder:r,gutter:u,defaultPosition:t}),y=aB(c,h);return ur.createElement(nB,{id:s.id,key:s.id,onHeightUpdate:o.updateHeight,className:s.visible?iB:"",style:y},s.type==="custom"?UA(s.message,s):v?v(s):ur.createElement(rB,{toast:s,position:c}))}))},MA=ja;