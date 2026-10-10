import{F as I,G as P,M as W,P as B,H as R}from"./index-nRmb_3VI.js";function q(e=25){const M=e*e,g=new Float32Array(M*2),n=new Float32Array(M*3),d=new Float32Array(M*3),c=new Float32Array(M*3),b=new Uint16Array((e-1)**2*6);let l=0,A=0;for(let f=0;f<e;f+=1)for(let p=0;p<e;p+=1){const o=f*e+p;g[o*2]=p/(e-1),g[o*2+1]=f/(e-1),p<e-1&&f<e-1&&(b.set([o,o+e,o+1,o+1,o+e,o+e+1],A),A+=6)}function G(){l=0,n.fill(0),d.fill(0),c.fill(0)}function C(f,p){for(let r=0;r<e;r+=1)for(let v=0;v<e;v+=1){const w=r*e+v,a=w*3;for(let i=0;i<3;i+=1){const h=n[a+i];let y=-.05*h;v>0&&(y+=.22*(n[a-3+i]-h)),v<e-1&&(y+=.22*(n[a+3+i]-h)),r>0&&(y+=.22*(n[a-e*3+i]-h)),r<e-1&&(y+=.22*(n[a+e*3+i]-h)),c[a+i]=y}if(!f.active)continue;const E=f.x-((g[w*2]*2-1)*p+n[a]),D=f.y-(1-g[w*2+1]*2+n[a+1]),t=Math.hypot(E,D),m=t/.84;if(m>=1)continue;const x=.4*.009;if(c[a+2]+=x*(1-m*m)**2*6,t>1e-4){const i=x*m*(1-m)**2*6.75*1.6/t;c[a]+=E*i,c[a+1]+=D*i}}let o=0;l=0;for(let r=0;r<n.length;r+=1)d[r]=(d[r]+c[r])*.8,l=Math.max(l,Math.abs(d[r])),n[r]=Math.max(-1.2,Math.min(1.2,n[r]+d[r])),o=Math.max(o,Math.abs(n[r]),Math.abs(d[r]));return o}return{grid:g,offsets:n,indices:b,step:C,reset:G,get speed(){return l}}}const H=`
precision highp float;
attribute vec2 aGrid;
attribute vec3 aOffset;
uniform float uAspect;
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = aGrid;
  vDepth = aOffset.z;
  vec2 base = vec2((aGrid.x * 2.0 - 1.0) * uAspect, 1.0 - aGrid.y * 2.0);
  vec2 p = base + aOffset.xy;
  float perspective = 4.6 / (4.6 - aOffset.z);
  gl_Position = vec4(vec2(p.x / uAspect, p.y) * perspective, 0.0, 1.0);
}
`,S=`
precision highp float;
uniform sampler2D tMap;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 color = texture2D(tMap, vUv);
  // 平面时原色输出，仅在形变处加入轻微明暗。
  color.rgb *= 1.0 + clamp(vDepth, 0.0, 1.0) * 0.08;
  gl_FragColor = color;
}
`;function k(e,M,g){const n=document.createElement("canvas"),d=new I({canvas:n,alpha:!0,antialias:!0,dpr:Math.min(devicePixelRatio||1,2)}),c=d.gl;try{let b=function(){!y||F||O||(w.attributes.aOffset.needsUpdate=!0,d.render({scene:D}))},l=function(){cancelAnimationFrame(x),x=0,h=0,t.active=!1,v.reset(),T=0,b()},A=function(s){if(x=0,F||document.hidden||!Y||O)return;const u=Math.min((s-i)/1e3,5/120);i=s;const _=1-Math.exp(-u/.06);for(t.x+=(t.targetX-t.x)*_,t.y+=(t.targetY-t.y)*_,h+=u;h>=.008333333333333333;)T=v.step(t,m),h-=.008333333333333333;if(!t.active&&T<1e-4){l();return}b(),!(t.active&&T>.005&&v.speed<1e-5&&Math.hypot(t.targetX-t.x,t.targetY-t.y)<1e-4)&&(x=requestAnimationFrame(A))},G=function(){x||!y||F||document.hidden||!Y||O||(i=performance.now(),x=requestAnimationFrame(A))},C=function(s){if(s.pointerType!=="mouse"&&s.pointerType!=="pen")return;const u=e.getBoundingClientRect();!u.width||!u.height||(t.targetX=((s.clientX-u.left)/u.width*2-1)*m,t.targetY=1-(s.clientY-u.top)/u.height*2,t.active||(t.x=t.targetX,t.y=t.targetY),t.active=!0,G())},f=function(){t.active=!1,G()},p=function(){document.hidden&&l()},o=function(s){s.preventDefault(),O=!0,l(),n.style.opacity="0",g(!1)},r=function(){const s=e.clientWidth,u=e.clientHeight;!s||!u||(d.setSize(s,u),m=s/u,E.uniforms.uAspect.value=m,l())};const v=q(),w=new P(c,{aGrid:{size:2,data:v.grid},aOffset:{size:3,data:v.offsets},index:{data:v.indices}}),a=new R(c,{generateMipmaps:!1,flipY:!1}),E=new B(c,{vertex:H,fragment:S,transparent:!0,cullFace:null,depthTest:!1,depthWrite:!1,uniforms:{tMap:{value:a},uAspect:{value:1.5}}}),D=new W(c,{geometry:w,program:E});n.className="absolute inset-0 size-full pointer-events-none",n.setAttribute("aria-hidden","true"),n.style.opacity="0",e.appendChild(n);const t={x:0,y:0,targetX:0,targetY:0,active:!1};let m=1.5,x=0,i=0,h=0,y=!1,F=!1,Y=!0,O=!1,T=0;const U=new ResizeObserver(r),X=new IntersectionObserver(([s])=>{Y=s.isIntersecting,Y||l()});U.observe(e),X.observe(e),r(),e.addEventListener("pointermove",C),e.addEventListener("pointerleave",f),e.addEventListener("pointercancel",f),n.addEventListener("webglcontextlost",o),document.addEventListener("visibilitychange",p),window.addEventListener("blur",l);const L=new Image;return L.onload=()=>{F||O||(a.image=L,y=!0,b(),n.style.opacity="1",g(!0))},L.onerror=()=>g(!1),L.src=M,()=>{F=!0,l(),L.onload=null,L.onerror=null,U.disconnect(),X.disconnect(),e.removeEventListener("pointermove",C),e.removeEventListener("pointerleave",f),e.removeEventListener("pointercancel",f),n.removeEventListener("webglcontextlost",o),document.removeEventListener("visibilitychange",p),window.removeEventListener("blur",l),w.remove(),E.remove(),c.deleteTexture(a.texture),n.remove(),c.getExtension("WEBGL_lose_context")?.loseContext()}}catch(b){throw n.remove(),c.getExtension("WEBGL_lose_context")?.loseContext(),b}}export{k as createElasticMeshRenderer};
