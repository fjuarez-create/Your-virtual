var gs=Object.defineProperty;var vs=(o,e)=>{for(var t in e)gs(o,t,{get:e[t],enumerable:!0})};import{BufferGeometry as Ga}from"three";import{Box3 as Rs}from"three";var Pe=Math.pow(2,-24),Je=Symbol("SKIP_GENERATION"),Tt={strategy:0,maxDepth:40,targetLeafSize:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0,range:null,[Je]:!1};function z(o,e,t){return t.min.x=e[o],t.min.y=e[o+1],t.min.z=e[o+2],t.max.x=e[o+3],t.max.y=e[o+4],t.max.z=e[o+5],t}function et(o){let e=-1,t=-1/0;for(let r=0;r<3;r++){let n=o[r+3]-o[r];n>t&&(t=n,e=r)}return e}function Br(o,e){e.set(o)}function Nr(o,e,t){let r,n;for(let s=0;s<3;s++){let i=s+3;r=o[s],n=e[s],t[s]=r<n?r:n,r=o[i],n=e[i],t[i]=r>n?r:n}}function tt(o,e,t){for(let r=0;r<3;r++){let n=e[o+2*r],s=e[o+2*r+1],i=n-s,c=n+s;i<t[r]&&(t[r]=i),c>t[r+3]&&(t[r+3]=c)}}function Fe(o){let e=o[3]-o[0],t=o[4]-o[1],r=o[5]-o[2];return 2*(e*t+t*r+r*e)}function C(o,e){return e[o+15]===65535}function B(o,e){return e[o+6]}function O(o,e){return e[o+14]}function N(o){return o+8}function L(o,e){let t=e[o+6];return o+t*8}function ie(o,e){return e[o+7]}function wt(o,e,t,r,n){let s=1/0,i=1/0,c=1/0,l=-1/0,m=-1/0,f=-1/0,u=1/0,a=1/0,h=1/0,g=-1/0,y=-1/0,d=-1/0,b=o.offset||0;for(let p=(e-b)*6,v=(e+t-b)*6;p<v;p+=6){let x=o[p+0],T=o[p+1],S=x-T,w=x+T;S<s&&(s=S),w>l&&(l=w),x<u&&(u=x),x>g&&(g=x);let A=o[p+2],R=o[p+3],_=A-R,P=A+R;_<i&&(i=_),P>m&&(m=P),A<a&&(a=A),A>y&&(y=A);let I=o[p+4],F=o[p+5],M=I-F,D=I+F;M<c&&(c=M),D>f&&(f=D),I<h&&(h=I),I>d&&(d=I)}r[0]=s,r[1]=i,r[2]=c,r[3]=l,r[4]=m,r[5]=f,n[0]=u,n[1]=a,n[2]=h,n[3]=g,n[4]=y,n[5]=d}var te=32,bs=(o,e)=>o.candidate-e.candidate,oe=new Array(te).fill().map(()=>({count:0,bounds:new Float32Array(6),rightCacheBounds:new Float32Array(6),leftCacheBounds:new Float32Array(6),candidate:0})),St=new Float32Array(6);function Di(o,e,t,r,n,s){let i=-1,c=0;if(s===0)i=et(e),i!==-1&&(c=(e[i]+e[i+3])/2);else if(s===1)i=et(o),i!==-1&&(c=Ts(t,r,n,i));else if(s===2){let l=Fe(o),m=1.25*n,f=t.offset||0,u=(r-f)*6,a=(r+n-f)*6;for(let h=0;h<3;h++){let g=e[h],b=(e[h+3]-g)/te;if(n<te/4){let p=[...oe];p.length=n;let v=0;for(let T=u;T<a;T+=6,v++){let S=p[v];S.candidate=t[T+2*h],S.count=0;let{bounds:w,leftCacheBounds:A,rightCacheBounds:R}=S;for(let _=0;_<3;_++)R[_]=1/0,R[_+3]=-1/0,A[_]=1/0,A[_+3]=-1/0,w[_]=1/0,w[_+3]=-1/0;tt(T,t,w)}p.sort(bs);let x=n;for(let T=0;T<x;T++){let S=p[T];for(;T+1<x&&p[T+1].candidate===S.candidate;)p.splice(T+1,1),x--}for(let T=u;T<a;T+=6){let S=t[T+2*h];for(let w=0;w<x;w++){let A=p[w];S>=A.candidate?tt(T,t,A.rightCacheBounds):(tt(T,t,A.leftCacheBounds),A.count++)}}for(let T=0;T<x;T++){let S=p[T],w=S.count,A=n-S.count,R=S.leftCacheBounds,_=S.rightCacheBounds,P=0;w!==0&&(P=Fe(R)/l);let I=0;A!==0&&(I=Fe(_)/l);let F=1+1.25*(P*w+I*A);F<m&&(i=h,m=F,c=S.candidate)}}else{for(let x=0;x<te;x++){let T=oe[x];T.count=0,T.candidate=g+b+x*b;let S=T.bounds;for(let w=0;w<3;w++)S[w]=1/0,S[w+3]=-1/0}for(let x=u;x<a;x+=6){let w=~~((t[x+2*h]-g)/b);w>=te&&(w=te-1);let A=oe[w];A.count++,tt(x,t,A.bounds)}let p=oe[te-1];Br(p.bounds,p.rightCacheBounds);for(let x=te-2;x>=0;x--){let T=oe[x],S=oe[x+1];Nr(T.bounds,S.rightCacheBounds,T.rightCacheBounds)}let v=0;for(let x=0;x<te-1;x++){let T=oe[x],S=T.count,w=T.bounds,R=oe[x+1].rightCacheBounds;S!==0&&(v===0?Br(w,St):Nr(w,St,St)),v+=S;let _=0,P=0;v!==0&&(_=Fe(St)/l);let I=n-v;I!==0&&(P=Fe(R)/l);let F=1+1.25*(_*v+P*I);F<m&&(i=h,m=F,c=T.candidate)}}}}else console.warn(`BVH: Invalid build strategy value ${s} used.`);return{axis:i,pos:c}}function Ts(o,e,t,r){let n=0,s=o.offset;for(let i=e,c=e+t;i<c;i++)n+=o[(i-s)*6+r*2];return n/t}var Me=class{constructor(){this.boundingData=new Float32Array(6)}};function Ci(o,e,t,r,n,s){let i=r,c=r+n-1,l=s.pos,m=s.axis*2,f=t.offset||0;for(;;){for(;i<=c&&t[(i-f)*6+m]<l;)i++;for(;i<=c&&t[(c-f)*6+m]>=l;)c--;if(i<c){for(let u=0;u<e;u++){let a=o[i*e+u];o[i*e+u]=o[c*e+u],o[c*e+u]=a}for(let u=0;u<6;u++){let a=i-f,h=c-f,g=t[a*6+u];t[a*6+u]=t[h*6+u],t[h*6+u]=g}i++,c--}else return i}}var Ei,_t,Lr,Bi,ws=Math.pow(2,32);function It(o){return"count"in o?1:1+It(o.left)+It(o.right)}function Ni(o,e,t){return Ei=new Float32Array(t),_t=new Uint32Array(t),Lr=new Uint16Array(t),Bi=new Uint8Array(t),Or(o,e)}function Or(o,e){let t=o/4,r=o/2,n="count"in e,s=e.boundingData;for(let i=0;i<6;i++)Ei[t+i]=s[i];if(n)return e.buffer?(Bi.set(new Uint8Array(e.buffer),o),o+e.buffer.byteLength):(_t[t+6]=e.offset,Lr[r+14]=e.count,Lr[r+15]=65535,o+32);{let{left:i,right:c,splitAxis:l}=e,m=o+32,f=Or(m,i),u=o/32,h=f/32-u;if(h>ws)throw new Error("MeshBVH: Cannot store relative child node offset greater than 32 bits.");return _t[t+6]=h,_t[t+7]=l,Or(f,c)}}function Ss(o,e,t,r,n,s){let{maxDepth:i,verbose:c,targetLeafSize:l,_strictLeafSize:m=1/0,strategy:f,onProgress:u}=n,a=o.primitiveBuffer,h=o.primitiveBufferStride,g=new Float32Array(6),y=!1,d=new Me;return wt(e,t,r,d.boundingData,g),p(d,t,r,g),d;function b(v){u&&u((v-s.offset)/s.count)}function p(v,x,T,S=null,w=0){!y&&w>=i&&(y=!0,c&&console.warn(`BVH: Max depth of ${i} reached when generating BVH. Consider increasing maxDepth.`));let A=T>m;if(T<=l&&!A||w>=i)return b(x+T),v.offset=x,v.count=T,v;let R=Di(v.boundingData,S,e,x,T,f),_=R.axis===-1?-1:Ci(a,h,e,x,T,R);if(R.axis===-1||_===x||_===x+T){if(!A)return b(x+T),v.offset=x,v.count=T,v;R.axis=Math.max(0,et(v.boundingData)),_=x+Math.max(1,Math.floor(T/2))}v.splitAxis=R.axis;let P=new Me,I=x,F=_-x;v.left=P,wt(e,I,F,P.boundingData,g),p(P,I,F,g,w+1);let M=new Me,D=_,H=T-F;return v.right=M,wt(e,D,H,M.boundingData,g),p(M,D,H,g,w+1),v}}function Li(o,e){let t=e.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,r=o.getRootRanges(e.range),n=r[0],s=r[r.length-1],i={offset:n.offset,count:s.offset+s.count-n.offset},c=new Float32Array(6*i.count);c.offset=i.offset,o.computePrimitiveBounds(i.offset,i.count,c),o._roots=r.map(l=>{let m=Ss(o,c,l.offset,l.count,e,i),f=It(m),u=new t(32*f);return Ni(0,m,u),u})}import{Box3 as Is}from"three";var ne=class{constructor(e){this._getNewPrimitive=e,this._primitives=[]}getPrimitive(){let e=this._primitives;return e.length===0?this._getNewPrimitive():e.pop()}releasePrimitive(e){this._primitives.push(e)}};var zr=class{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;let e=[],t=null;this.setBuffer=r=>{t&&e.push(t),t=r,this.float32Array=new Float32Array(r),this.uint16Array=new Uint16Array(r),this.uint32Array=new Uint32Array(r)},this.clearBuffer=()=>{t=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,e.length!==0&&this.setBuffer(e.pop())}}},E=new zr;var se,Ce,De=[],At=new ne(()=>new Is);function Oi(o,e,t,r,n,s){se=At.getPrimitive(),Ce=At.getPrimitive(),De.push(se,Ce),E.setBuffer(o._roots[e]);let i=kr(0,o.geometry,t,r,n,s);E.clearBuffer(),At.releasePrimitive(se),At.releasePrimitive(Ce),De.pop(),De.pop();let c=De.length;return c>0&&(Ce=De[c-1],se=De[c-2]),i}function kr(o,e,t,r,n=null,s=0,i=0){let{float32Array:c,uint16Array:l,uint32Array:m}=E,f=o*2;if(C(f,l)){let a=B(o,m),h=O(f,l);return z(o,c,se),r(a,h,!1,i,s+o/8,se)}else{let _=function(I){let{uint16Array:F,uint32Array:M}=E,D=I*2;for(;!C(D,F);)I=N(I),D=I*2;return B(I,M)},P=function(I){let{uint16Array:F,uint32Array:M}=E,D=I*2;for(;!C(D,F);)I=L(I,M),D=I*2;return B(I,M)+O(D,F)},a=N(o),h=L(o,m),g=a,y=h,d,b,p,v;if(n&&(p=se,v=Ce,z(g,c,p),z(y,c,v),d=n(p),b=n(v),b<d)){g=h,y=a;let I=d;d=b,b=I,p=v}p||(p=se,z(g,c,p));let x=C(g*2,l),T=t(p,x,d,i+1,s+g/8),S;if(T===2){let I=_(g),M=P(g)-I;S=r(I,M,!0,i+1,s+g/8,p)}else S=T&&kr(g,e,t,r,n,s,i+1);if(S)return!0;v=Ce,z(y,c,v);let w=C(y*2,l),A=t(v,w,b,i+1,s+y/8),R;if(A===2){let I=_(y),M=P(y)-I;R=r(I,M,!0,i+1,s+y/8,v)}else R=A&&kr(y,e,t,r,n,s,i+1);return!!R}}import{Box3 as it,Matrix4 as As}from"three";var rt=new E.constructor,Pt=new E.constructor,ae=new ne(()=>new it),Ee=new it,Be=new it,Hr=new it,Ur=new it,Vr=!1;function zi(o,e,t,r){if(Vr)throw new Error("MeshBVH: Recursive calls to bvhcast not supported.");Vr=!0;let n=o._roots,s=e._roots,i,c=0,l=0,m=new As().copy(t).invert();for(let f=0,u=n.length;f<u;f++){rt.setBuffer(n[f]),l=0;let a=ae.getPrimitive();z(0,rt.float32Array,a),a.applyMatrix4(m);for(let h=0,g=s.length;h<g&&(Pt.setBuffer(s[h]),i=K(0,0,t,m,r,c,l,0,0,a),Pt.clearBuffer(),l+=s[h].byteLength/32,!i);h++);if(ae.releasePrimitive(a),rt.clearBuffer(),c+=n[f].byteLength/32,i)break}return Vr=!1,i}function K(o,e,t,r,n,s=0,i=0,c=0,l=0,m=null,f=!1){let u,a;f?(u=Pt,a=rt):(u=rt,a=Pt);let h=u.float32Array,g=u.uint32Array,y=u.uint16Array,d=a.float32Array,b=a.uint32Array,p=a.uint16Array,v=o*2,x=e*2,T=C(v,y),S=C(x,p),w=!1;if(S&&T)f?w=n(B(e,b),O(e*2,p),B(o,g),O(o*2,y),l,i+e/8,c,s+o/8):w=n(B(o,g),O(o*2,y),B(e,b),O(e*2,p),c,s+o/8,l,i+e/8);else if(S){let A=ae.getPrimitive();z(e,d,A),A.applyMatrix4(t);let R=N(o),_=L(o,g);z(R,h,Ee),z(_,h,Be);let P=A.intersectsBox(Ee),I=A.intersectsBox(Be);w=P&&K(e,R,r,t,n,i,s,l,c+1,A,!f)||I&&K(e,_,r,t,n,i,s,l,c+1,A,!f),ae.releasePrimitive(A)}else{let A=N(e),R=L(e,b);z(A,d,Hr),z(R,d,Ur);let _=m.intersectsBox(Hr),P=m.intersectsBox(Ur);if(_&&P)w=K(o,A,t,r,n,s,i,c,l+1,m,f)||K(o,R,t,r,n,s,i,c,l+1,m,f);else if(_)if(T)w=K(o,A,t,r,n,s,i,c,l+1,m,f);else{let I=ae.getPrimitive();I.copy(Hr).applyMatrix4(t);let F=N(o),M=L(o,g);z(F,h,Ee),z(M,h,Be);let D=I.intersectsBox(Ee),H=I.intersectsBox(Be);w=D&&K(A,F,r,t,n,i,s,l,c+1,I,!f)||H&&K(A,M,r,t,n,i,s,l,c+1,I,!f),ae.releasePrimitive(I)}else if(P)if(T)w=K(o,R,t,r,n,s,i,c,l+1,m,f);else{let I=ae.getPrimitive();I.copy(Ur).applyMatrix4(t);let F=N(o),M=L(o,g);z(F,h,Ee),z(M,h,Be);let D=I.intersectsBox(Ee),H=I.intersectsBox(Be);w=D&&K(R,F,r,t,n,i,s,l,c+1,I,!f)||H&&K(R,M,r,t,n,i,s,l,c+1,I,!f),ae.releasePrimitive(I)}}return w}var Ft=new class{constructor(){let o=null,e=null,t=null,r=!1;this.root=null,this.buffer=null,this.uint32Array=null,this.uint16Array=null,this.setBVH=(s,i)=>{if(r)throw new Error("BVHTraversalHelper: cannot call setBVH during an active traversal.");this.root=i,this.buffer=o=s._roots[i],this.uint16Array=t=new Uint16Array(o),this.uint32Array=e=new Uint32Array(o)},this.reset=()=>{this.root=null,this.buffer=o=null,this.uint16Array=t=null,this.uint32Array=e=null},this.getRangeStart=s=>{let i=s*2;for(;!C(i,t);)s=N(s),i=s*2;return B(s,e)},this.getRangeEnd=s=>{let i=s*2;for(;!C(i,t);)s=L(s,e),i=s*2;return B(s,e)+O(i,t)};let n=(s,i,c)=>{let l=i*2,m=C(l,t);if(!s(c,m,i)&&!m){let u=N(i),a=L(i,e);n(s,u,c+1),n(s,a,c+1)}};this.traverseBuffer=s=>{if(r)throw new Error("BVHTraversalHelper: cannot start a traversal during an active traversal.");r=!0;try{n(s,0,0)}finally{r=!1}},this.traverse=s=>{this.traverseBuffer((i,c,l)=>{if(c){let m=l*2,f=e[l+6],u=t[m+14];return s(i,c,new Float32Array(o,l*4,6),f,u)}else{let m=ie(l,e);return s(i,c,new Float32Array(o,l*4,6),m)}})}}};var ki=new Rs,Ne=new Float32Array(6),Mt=class{constructor(){this._roots=null,this.primitiveBuffer=null,this.primitiveBufferStride=null}init(e){e={...Tt,...e},"maxLeafSize"in e&&(console.warn('BVH: "maxLeafSize" option has been deprecated. Use "targetLeafSize", instead.'),e={...e,targetLeafSize:e.maxLeafSize}),Li(this,e)}getRootRanges(){throw new Error("BVH: getRootRanges() not implemented")}writePrimitiveBounds(){throw new Error("BVH: writePrimitiveBounds() not implemented")}writePrimitiveRangeBounds(e,t,r,n){let s=1/0,i=1/0,c=1/0,l=-1/0,m=-1/0,f=-1/0;for(let u=e,a=e+t;u<a;u++){this.writePrimitiveBounds(u,Ne,0);let[h,g,y,d,b,p]=Ne;h<s&&(s=h),d>l&&(l=d),g<i&&(i=g),b>m&&(m=b),y<c&&(c=y),p>f&&(f=p)}return r[n+0]=s,r[n+1]=i,r[n+2]=c,r[n+3]=l,r[n+4]=m,r[n+5]=f,r}computePrimitiveBounds(e,t,r){let n=r.offset||0;for(let s=e,i=e+t;s<i;s++){this.writePrimitiveBounds(s,Ne,0);let[c,l,m,f,u,a]=Ne,h=(c+f)/2,g=(l+u)/2,y=(m+a)/2,d=(f-c)/2,b=(u-l)/2,p=(a-m)/2,v=(s-n)*6;r[v+0]=h,r[v+1]=d+(Math.abs(h)+d)*Pe,r[v+2]=g,r[v+3]=b+(Math.abs(g)+b)*Pe,r[v+4]=y,r[v+5]=p+(Math.abs(y)+p)*Pe}return r}shiftPrimitiveOffsets(e){let t=this._indirectBuffer;if(t)for(let r=0,n=t.length;r<n;r++)t[r]+=e;else{let r=this._roots;for(let n=0;n<r.length;n++){let s=r[n],i=new Uint32Array(s),c=new Uint16Array(s),l=s.byteLength/32;for(let m=0;m<l;m++){let f=8*m,u=2*f;C(u,c)&&(i[f+6]+=e)}}}}traverse(e,t=0){Ft.setBVH(this,t),Ft.traverse(e),Ft.reset()}refit(){let e=this._roots;for(let t=0,r=e.length;t<r;t++){let n=e[t],s=new Uint32Array(n),i=new Uint16Array(n),c=new Float32Array(n),l=n.byteLength/32;for(let m=l-1;m>=0;m--){let f=m*8,u=f*2;if(C(u,i)){let h=B(f,s),g=O(u,i);this.writePrimitiveRangeBounds(h,g,Ne,0),c.set(Ne,f)}else{let h=N(f),g=L(f,s);for(let y=0;y<3;y++){let d=c[h+y],b=c[h+y+3],p=c[g+y],v=c[g+y+3];c[f+y]=d<p?d:p,c[f+y+3]=b>v?b:v}}}}}getBoundingBox(e){return e.makeEmpty(),this._roots.forEach(r=>{z(0,new Float32Array(r),ki),e.union(ki)}),e}shapecast(e){let{boundsTraverseOrder:t,intersectsBounds:r,intersectsRange:n,intersectsPrimitive:s,scratchPrimitive:i,iterate:c}=e;if(n&&s){let u=n;n=(a,h,g,y,d)=>u(a,h,g,y,d)?!0:c(a,h,this,s,g,y,i)}else n||(s?n=(u,a,h,g)=>c(u,a,this,s,h,g,i):n=(u,a,h)=>h);let l=!1,m=0,f=this._roots;for(let u=0,a=f.length;u<a;u++){let h=f[u];if(l=Oi(this,u,r,n,t,m),l)break;m+=h.byteLength/32}return l}bvhcast(e,t,r){let{intersectsRanges:n}=r;return zi(this,e,t,n)}};import{Box3 as Ds}from"three";function Hi(){return typeof SharedArrayBuffer<"u"}import{BufferAttribute as Ps}from"three";function ot(o){return o.index?o.index.count:o.attributes.position.count}function ce(o){return ot(o)/3}function Wr(o,e=ArrayBuffer){return o>65535?new Uint32Array(new e(4*o)):new Uint16Array(new e(2*o))}function Ui(o,e){if(!o.index){let t=o.attributes.position.count,r=e.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,n=Wr(t,r);o.setIndex(new Ps(n,1));for(let s=0;s<t;s++)n[s]=s}}function Fs(o,e,t){let r=ot(o)/t,n=e||o.drawRange,s=n.start/t,i=(n.start+n.count)/t,c=Math.max(0,s),l=Math.min(r,i)-c;return{offset:Math.floor(c),count:Math.floor(l)}}function Ms(o,e){return o.groups.map(t=>({offset:t.start/e,count:t.count/e}))}function Gr(o,e,t){let r=Fs(o,e,t),n=Ms(o,t);if(!n.length)return[r];let s=[],i=r.offset,c=r.offset+r.count,l=ot(o)/t,m=[];for(let a of n){let{offset:h,count:g}=a,y=h,d=isFinite(g)?g:l-h,b=h+d;y<c&&b>i&&(m.push({pos:Math.max(i,y),isStart:!0}),m.push({pos:Math.min(c,b),isStart:!1}))}m.sort((a,h)=>a.pos!==h.pos?a.pos-h.pos:a.type==="end"?-1:1);let f=0,u=null;for(let a of m){let h=a.pos;f!==0&&h!==u&&s.push({offset:u,count:h-u}),f+=a.isStart?1:-1,u=h}return s}function Cs(o,e){let t=o[o.length-1],r=t.offset+t.count>2**16,n=o.reduce((m,f)=>m+f.count,0),s=r?4:2,i=e?new SharedArrayBuffer(n*s):new ArrayBuffer(n*s),c=r?new Uint32Array(i):new Uint16Array(i),l=0;for(let m=0;m<o.length;m++){let{offset:f,count:u}=o[m];for(let a=0;a<u;a++)c[l+a]=f+a;l+=u}return c}var Dt=class extends Mt{get indirect(){return!!this._indirectBuffer}get primitiveStride(){return null}get primitiveBufferStride(){return this.indirect?1:this.primitiveStride}set primitiveBufferStride(e){}get primitiveBuffer(){return this.indirect?this._indirectBuffer:this.geometry.index.array}set primitiveBuffer(e){}constructor(e,t={}){if(e.isBufferGeometry){if(e.index&&e.index.isInterleavedBufferAttribute)throw new Error("BVH: InterleavedBufferAttribute is not supported for the index attribute.")}else throw new Error("BVH: Only BufferGeometries are supported.");if(t.useSharedArrayBuffer&&!Hi())throw new Error("BVH: SharedArrayBuffer is not available.");super(),this.geometry=e,this.resolvePrimitiveIndex=t.indirect?r=>this._indirectBuffer[r]:r=>r,this.primitiveBuffer=null,this.primitiveBufferStride=null,this._indirectBuffer=null,t={...Tt,...t},t[Je]||this.init(t)}init(e){let{geometry:t,primitiveStride:r}=this;if(e.indirect){let n=Gr(t,e.range,r),s=Cs(n,e.useSharedArrayBuffer);this._indirectBuffer=s}else Ui(t,e);super.init(e),!t.boundingBox&&e.setBoundingBox&&(t.boundingBox=this.getBoundingBox(new Ds))}getRootRanges(e){return this.indirect?[{offset:0,count:this._indirectBuffer.length}]:Gr(this.geometry,e,this.primitiveStride)}raycastObject3D(){throw new Error("BVH: raycastObject3D() not implemented")}};import{BufferAttribute as aa,FrontSide as bo,Ray as ca,Vector3 as _o,Matrix4 as la}from"three";import{Vector3 as le,Matrix4 as qi,Line3 as Yi}from"three";import{Vector3 as Es}from"three";var $=class{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(e,t){let r=1/0,n=-1/0;for(let s=0,i=e.length;s<i;s++){let l=e[s][t];r=l<r?l:r,n=l>n?l:n}this.min=r,this.max=n}setFromPoints(e,t){let r=1/0,n=-1/0;for(let s=0,i=t.length;s<i;s++){let c=t[s],l=e.dot(c);r=l<r?l:r,n=l>n?l:n}this.min=r,this.max=n}isSeparated(e){return this.min>e.max||e.min>this.max}};$.prototype.setFromBox=function(){let o=new Es;return function(t,r){let n=r.min,s=r.max,i=1/0,c=-1/0;for(let l=0;l<=1;l++)for(let m=0;m<=1;m++)for(let f=0;f<=1;f++){o.x=n.x*l+s.x*(1-l),o.y=n.y*m+s.y*(1-m),o.z=n.z*f+s.z*(1-f);let u=t.dot(o);i=Math.min(u,i),c=Math.max(u,c)}this.min=i,this.max=c}}();import{Triangle as zs,Vector3 as Z,Vector2 as Wi,Line3 as Le,Plane as ks}from"three";import{Vector3 as de,Vector2 as Bs,Plane as Ns,Line3 as Ls}from"three";var Os=function(){let o=new de,e=new de,t=new de;return function(n,s,i){let c=n.start,l=o,m=s.start,f=e;t.subVectors(c,m),o.subVectors(n.end,n.start),e.subVectors(s.end,s.start);let u=t.dot(f),a=f.dot(l),h=f.dot(f),g=t.dot(l),d=l.dot(l)*h-a*a,b,p;d!==0?b=(u*a-g*h)/d:b=0,p=(u+b*a)/h,i.x=b,i.y=p}}(),nt=function(){let o=new Bs,e=new de,t=new de;return function(n,s,i,c){Os(n,s,o);let l=o.x,m=o.y;if(l>=0&&l<=1&&m>=0&&m<=1){n.at(l,i),s.at(m,c);return}else if(l>=0&&l<=1){m<0?s.at(0,c):s.at(1,c),n.closestPointToPoint(c,!0,i);return}else if(m>=0&&m<=1){l<0?n.at(0,i):n.at(1,i),s.closestPointToPoint(i,!0,c);return}else{let f;l<0?f=n.start:f=n.end;let u;m<0?u=s.start:u=s.end;let a=e,h=t;if(n.closestPointToPoint(u,!0,e),s.closestPointToPoint(f,!0,t),a.distanceToSquared(u)<=h.distanceToSquared(f)){i.copy(a),c.copy(u);return}else{i.copy(f),c.copy(h);return}}}}(),Vi=function(){let o=new de,e=new de,t=new Ns,r=new Ls;return function(s,i){let{radius:c,center:l}=s,{a:m,b:f,c:u}=i;if(r.start=m,r.end=f,r.closestPointToPoint(l,!0,o).distanceTo(l)<=c||(r.start=m,r.end=u,r.closestPointToPoint(l,!0,o).distanceTo(l)<=c)||(r.start=f,r.end=u,r.closestPointToPoint(l,!0,o).distanceTo(l)<=c))return!0;let y=i.getPlane(t);if(Math.abs(y.distanceToPoint(l))<=c){let b=y.projectPoint(l,e);if(i.containsPoint(b))return!0}return!1}}();var Hs=["x","y","z"],re=1e-15,Gi=re*re;function X(o){return Math.abs(o)<re}var G=class extends zs{constructor(...e){super(...e),this.isExtendedTriangle=!0,this.satAxes=new Array(4).fill().map(()=>new Z),this.satBounds=new Array(4).fill().map(()=>new $),this.points=[this.a,this.b,this.c],this.plane=new ks,this.isDegenerateIntoSegment=!1,this.isDegenerateIntoPoint=!1,this.degenerateSegment=new Le,this.needsUpdate=!0}intersectsSphere(e){return Vi(e,this)}update(){let e=this.a,t=this.b,r=this.c,n=this.points,s=this.satAxes,i=this.satBounds,c=s[0],l=i[0];this.getNormal(c),l.setFromPoints(c,n);let m=s[1],f=i[1];m.subVectors(e,t),f.setFromPoints(m,n);let u=s[2],a=i[2];u.subVectors(t,r),a.setFromPoints(u,n);let h=s[3],g=i[3];h.subVectors(r,e),g.setFromPoints(h,n);let y=m.length(),d=u.length(),b=h.length();this.isDegenerateIntoPoint=!1,this.isDegenerateIntoSegment=!1,y<re?d<re||b<re?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(e),this.degenerateSegment.end.copy(r)):d<re?b<re?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(t),this.degenerateSegment.end.copy(e)):b<re&&(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(r),this.degenerateSegment.end.copy(t)),this.plane.setFromNormalAndCoplanarPoint(c,e),this.needsUpdate=!1}};G.prototype.closestPointToSegment=function(){let o=new Z,e=new Z,t=new Le;return function(n,s=null,i=null){let{start:c,end:l}=n,m=this.points,f,u=1/0;for(let a=0;a<3;a++){let h=(a+1)%3;t.start.copy(m[a]),t.end.copy(m[h]),nt(t,n,o,e),f=o.distanceToSquared(e),f<u&&(u=f,s&&s.copy(o),i&&i.copy(e))}return this.closestPointToPoint(c,o),f=c.distanceToSquared(o),f<u&&(u=f,s&&s.copy(o),i&&i.copy(c)),this.closestPointToPoint(l,o),f=l.distanceToSquared(o),f<u&&(u=f,s&&s.copy(o),i&&i.copy(l)),Math.sqrt(u)}}();G.prototype.intersectsTriangle=function(){let o=new G,e=new $,t=new $,r=new Z,n=new Z,s=new Z,i=new Z,c=new Le,l=new Le,m=new Z,f=new Wi,u=new Wi;function a(v,x,T,S){let w=r;!v.isDegenerateIntoPoint&&!v.isDegenerateIntoSegment?w.copy(v.plane.normal):w.copy(x.plane.normal);let A=v.satBounds,R=v.satAxes;for(let I=1;I<4;I++){let F=A[I],M=R[I];if(e.setFromPoints(M,x.points),F.isSeparated(e)||(i.copy(w).cross(M),e.setFromPoints(i,v.points),t.setFromPoints(i,x.points),e.isSeparated(t)))return!1}let _=x.satBounds,P=x.satAxes;for(let I=1;I<4;I++){let F=_[I],M=P[I];if(e.setFromPoints(M,v.points),F.isSeparated(e)||(i.crossVectors(w,M),e.setFromPoints(i,v.points),t.setFromPoints(i,x.points),e.isSeparated(t)))return!1}return T&&(S||console.warn("ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0."),T.start.set(0,0,0),T.end.set(0,0,0)),!0}function h(v,x,T,S,w,A,R,_,P,I,F){let M=R/(R-_);I.x=S+(w-S)*M,F.start.subVectors(x,v).multiplyScalar(M).add(v),M=R/(R-P),I.y=S+(A-S)*M,F.end.subVectors(T,v).multiplyScalar(M).add(v)}function g(v,x,T,S,w,A,R,_,P,I,F){if(w>0)h(v.c,v.a,v.b,S,x,T,P,R,_,I,F);else if(A>0)h(v.b,v.a,v.c,T,x,S,_,R,P,I,F);else if(_*P>0||R!=0)h(v.a,v.b,v.c,x,T,S,R,_,P,I,F);else if(_!=0)h(v.b,v.a,v.c,T,x,S,_,R,P,I,F);else if(P!=0)h(v.c,v.a,v.b,S,x,T,P,R,_,I,F);else return!0;return!1}function y(v,x,T,S){let w=x.degenerateSegment,A=v.plane.distanceToPoint(w.start),R=v.plane.distanceToPoint(w.end);return X(A)?X(R)?a(v,x,T,S):(T&&(T.start.copy(w.start),T.end.copy(w.start)),v.containsPoint(w.start)):X(R)?(T&&(T.start.copy(w.end),T.end.copy(w.end)),v.containsPoint(w.end)):v.plane.intersectLine(w,r)!=null?(T&&(T.start.copy(r),T.end.copy(r)),v.containsPoint(r)):!1}function d(v,x,T){let S=x.a;return X(v.plane.distanceToPoint(S))&&v.containsPoint(S)?(T&&(T.start.copy(S),T.end.copy(S)),!0):!1}function b(v,x,T){let S=v.degenerateSegment,w=x.a;return S.closestPointToPoint(w,!0,r),w.distanceToSquared(r)<Gi?(T&&(T.start.copy(w),T.end.copy(w)),!0):!1}function p(v,x,T,S){if(v.isDegenerateIntoSegment)if(x.isDegenerateIntoSegment){let w=v.degenerateSegment,A=x.degenerateSegment,R=n,_=s;w.delta(R),A.delta(_);let P=r.subVectors(A.start,w.start),I=R.x*_.y-R.y*_.x;if(X(I))return!1;let F=(P.x*_.y-P.y*_.x)/I,M=-(R.x*P.y-R.y*P.x)/I;if(F<0||F>1||M<0||M>1)return!1;let D=w.start.z+R.z*F,H=A.start.z+_.z*M;return X(D-H)?(T&&(T.start.copy(w.start).addScaledVector(R,F),T.end.copy(w.start).addScaledVector(R,F)),!0):!1}else return x.isDegenerateIntoPoint?b(v,x,T):y(x,v,T,S);else{if(v.isDegenerateIntoPoint)return x.isDegenerateIntoPoint?x.a.distanceToSquared(v.a)<Gi?(T&&(T.start.copy(v.a),T.end.copy(v.a)),!0):!1:x.isDegenerateIntoSegment?b(x,v,T):d(x,v,T);if(x.isDegenerateIntoPoint)return d(v,x,T);if(x.isDegenerateIntoSegment)return y(v,x,T,S)}}return function(x,T=null,S=!1){this.needsUpdate&&this.update(),x.isExtendedTriangle?x.needsUpdate&&x.update():(o.copy(x),o.update(),x=o);let w=p(this,x,T,S);if(w!==void 0)return w;let A=this.plane,R=x.plane,_=R.distanceToPoint(this.a),P=R.distanceToPoint(this.b),I=R.distanceToPoint(this.c);X(_)&&(_=0),X(P)&&(P=0),X(I)&&(I=0);let F=_*P,M=_*I;if(F>0&&M>0)return!1;let D=A.distanceToPoint(x.a),H=A.distanceToPoint(x.b),_e=A.distanceToPoint(x.c);X(D)&&(D=0),X(H)&&(H=0),X(_e)&&(_e=0);let Ie=D*H,Ze=D*_e;if(Ie>0&&Ze>0)return!1;n.copy(A.normal),s.copy(R.normal);let Ae=n.cross(s),me=0,Cr=Math.abs(Ae.x),Pi=Math.abs(Ae.y);Pi>Cr&&(Cr=Pi,me=1),Math.abs(Ae.z)>Cr&&(me=2);let Re=Hs[me],us=this.a[Re],fs=this.b[Re],ms=this.c[Re],ds=x.a[Re],hs=x.b[Re],ps=x.c[Re];if(g(this,us,fs,ms,F,M,_,P,I,f,c))return a(this,x,T,S);if(g(x,ds,hs,ps,Ie,Ze,D,H,_e,u,l))return a(this,x,T,S);if(f.y<f.x){let Er=f.y;f.y=f.x,f.x=Er,m.copy(c.start),c.start.copy(c.end),c.end.copy(m)}if(u.y<u.x){let Er=u.y;u.y=u.x,u.x=Er,m.copy(l.start),l.start.copy(l.end),l.end.copy(m)}return f.y<u.x||u.y<f.x?!1:(T&&(u.x>f.x?T.start.copy(l.start):T.start.copy(c.start),u.y<f.y?T.end.copy(l.end):T.end.copy(c.end)),!0)}}();G.prototype.distanceToPoint=function(){let o=new Z;return function(t){return this.closestPointToPoint(t,o),t.distanceTo(o)}}();G.prototype.distanceToTriangle=function(){let o=new Z,e=new Z,t=["a","b","c"],r=new Le,n=new Le;return function(i,c=null,l=null){let m=c||l?r:null;if(this.intersectsTriangle(i,m,!0))return(c||l)&&(c&&m.getCenter(c),l&&m.getCenter(l)),0;let f=1/0;for(let u=0;u<3;u++){let a,h=t[u],g=i[h];this.closestPointToPoint(g,o),a=g.distanceToSquared(o),a<f&&(f=a,c&&c.copy(o),l&&l.copy(g));let y=this[h];i.closestPointToPoint(y,o),a=y.distanceToSquared(o),a<f&&(f=a,c&&c.copy(y),l&&l.copy(o))}for(let u=0;u<3;u++){let a=t[u],h=t[(u+1)%3];r.set(this[a],this[h]);for(let g=0;g<3;g++){let y=t[g],d=t[(g+1)%3];n.set(i[y],i[d]),nt(r,n,o,e);let b=o.distanceToSquared(e);b<f&&(f=b,c&&c.copy(o),l&&l.copy(e))}}return Math.sqrt(f)}}();var U=class{constructor(e,t,r){this.isOrientedBox=!0,this.min=new le,this.max=new le,this.matrix=new qi,this.invMatrix=new qi,this.points=new Array(8).fill().map(()=>new le),this.satAxes=new Array(3).fill().map(()=>new le),this.satBounds=new Array(3).fill().map(()=>new $),this.alignedSatBounds=new Array(3).fill().map(()=>new $),this.needsUpdate=!1,e&&this.min.copy(e),t&&this.max.copy(t),r&&this.matrix.copy(r)}set(e,t,r){this.min.copy(e),this.max.copy(t),this.matrix.copy(r),this.needsUpdate=!0}copy(e){this.min.copy(e.min),this.max.copy(e.max),this.matrix.copy(e.matrix),this.needsUpdate=!0}};U.prototype.update=function(){return function(){let e=this.matrix,t=this.min,r=this.max,n=this.points;for(let m=0;m<=1;m++)for(let f=0;f<=1;f++)for(let u=0;u<=1;u++){let a=1*m|2*f|4*u,h=n[a];h.x=m?r.x:t.x,h.y=f?r.y:t.y,h.z=u?r.z:t.z,h.applyMatrix4(e)}let s=this.satBounds,i=this.satAxes,c=n[0];for(let m=0;m<3;m++){let f=i[m],u=s[m],a=1<<m,h=n[a];f.subVectors(c,h),u.setFromPoints(f,n)}let l=this.alignedSatBounds;l[0].setFromPointsField(n,"x"),l[1].setFromPointsField(n,"y"),l[2].setFromPointsField(n,"z"),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}}();U.prototype.intersectsBox=function(){let o=new $;return function(t){this.needsUpdate&&this.update();let r=t.min,n=t.max,s=this.satBounds,i=this.satAxes,c=this.alignedSatBounds;if(o.min=r.x,o.max=n.x,c[0].isSeparated(o)||(o.min=r.y,o.max=n.y,c[1].isSeparated(o))||(o.min=r.z,o.max=n.z,c[2].isSeparated(o)))return!1;for(let l=0;l<3;l++){let m=i[l],f=s[l];if(o.setFromBox(m,t),f.isSeparated(o))return!1}return!0}}();U.prototype.intersectsTriangle=function(){let o=new G,e=new Array(3),t=new $,r=new $,n=new le;return function(i){this.needsUpdate&&this.update(),i.isExtendedTriangle?i.needsUpdate&&i.update():(o.copy(i),o.update(),i=o);let c=this.satBounds,l=this.satAxes;e[0]=i.a,e[1]=i.b,e[2]=i.c;for(let a=0;a<3;a++){let h=c[a],g=l[a];if(t.setFromPoints(g,e),h.isSeparated(t))return!1}let m=i.satBounds,f=i.satAxes,u=this.points;for(let a=0;a<3;a++){let h=m[a],g=f[a];if(t.setFromPoints(g,u),h.isSeparated(t))return!1}for(let a=0;a<3;a++){let h=l[a];for(let g=0;g<4;g++){let y=f[g];if(n.crossVectors(h,y),t.setFromPoints(n,e),r.setFromPoints(n,u),t.isSeparated(r))return!1}}return!0}}();U.prototype.closestPointToPoint=function(){return function(e,t){return this.needsUpdate&&this.update(),t.copy(e).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),t}}();U.prototype.distanceToPoint=function(){let o=new le;return function(t){return this.closestPointToPoint(t,o),t.distanceTo(o)}}();U.prototype.distanceToBox=function(){let o=["x","y","z"],e=new Array(12).fill().map(()=>new Yi),t=new Array(12).fill().map(()=>new Yi),r=new le,n=new le;return function(i,c=0,l=null,m=null){if(this.needsUpdate&&this.update(),this.intersectsBox(i))return(l||m)&&(i.getCenter(n),this.closestPointToPoint(n,r),i.closestPointToPoint(r,n),l&&l.copy(r),m&&m.copy(n)),0;let f=c*c,u=i.min,a=i.max,h=this.points,g=1/0;for(let d=0;d<8;d++){let b=h[d];n.copy(b).clamp(u,a);let p=b.distanceToSquared(n);if(p<g&&(g=p,l&&l.copy(b),m&&m.copy(n),p<f))return Math.sqrt(p)}let y=0;for(let d=0;d<3;d++)for(let b=0;b<=1;b++)for(let p=0;p<=1;p++){let v=(d+1)%3,x=(d+2)%3,T=b<<v|p<<x,S=1<<d|b<<v|p<<x,w=h[T],A=h[S];e[y].set(w,A);let _=o[d],P=o[v],I=o[x],F=t[y],M=F.start,D=F.end;M[_]=u[_],M[P]=b?u[P]:a[P],M[I]=p?u[I]:a[P],D[_]=a[_],D[P]=b?u[P]:a[P],D[I]=p?u[I]:a[P],y++}for(let d=0;d<=1;d++)for(let b=0;b<=1;b++)for(let p=0;p<=1;p++){n.x=d?a.x:u.x,n.y=b?a.y:u.y,n.z=p?a.z:u.z,this.closestPointToPoint(n,r);let v=n.distanceToSquared(r);if(v<g&&(g=v,l&&l.copy(r),m&&m.copy(n),v<f))return Math.sqrt(v)}for(let d=0;d<12;d++){let b=e[d];for(let p=0;p<12;p++){let v=t[p];nt(b,v,r,n);let x=r.distanceToSquared(n);if(x<g&&(g=x,l&&l.copy(r),m&&m.copy(n),x<f))return Math.sqrt(x)}}return Math.sqrt(g)}}();var qr=class extends ne{constructor(){super(()=>new G)}},q=new qr;import{Vector3 as $i}from"three";var st=new $i,Yr=new $i;function Xi(o,e,t={},r=0,n=1/0){let s=r*r,i=n*n,c=1/0,l=null;if(o.shapecast({boundsTraverseOrder:f=>(st.copy(e).clamp(f.min,f.max),st.distanceToSquared(e)),intersectsBounds:(f,u,a)=>a<c&&a<i,intersectsTriangle:(f,u)=>{f.closestPointToPoint(e,st);let a=e.distanceToSquared(st);return a<c&&(Yr.copy(st),c=a,l=u),a<s}}),c===1/0)return null;let m=Math.sqrt(c);return t.point?t.point.copy(Yr):t.point=Yr.clone(),t.distance=m,t.faceIndex=l,t}import{Vector3 as ee,Vector2 as lt,Triangle as at,DoubleSide as Us,BackSide as Vs,REVISION as eo}from"three";var Ct=parseInt(eo)>=169,Ws=parseInt(eo)<=161,he=new ee,pe=new ee,ge=new ee,Et=new lt,Bt=new lt,Nt=new lt,ji=new ee,Qi=new ee,Ki=new ee,ct=new ee;function Gs(o,e,t,r,n,s,i,c){let l;if(s===Vs?l=o.intersectTriangle(r,t,e,!0,n):l=o.intersectTriangle(e,t,r,s!==Us,n),l===null)return null;let m=o.origin.distanceTo(n);return m<i||m>c?null:{distance:m,point:n.clone()}}function Zi(o,e,t,r,n,s,i,c,l,m,f){he.fromBufferAttribute(e,s),pe.fromBufferAttribute(e,i),ge.fromBufferAttribute(e,c);let u=Gs(o,he,pe,ge,ct,l,m,f);if(u){if(r){Et.fromBufferAttribute(r,s),Bt.fromBufferAttribute(r,i),Nt.fromBufferAttribute(r,c),u.uv=new lt;let h=at.getInterpolation(ct,he,pe,ge,Et,Bt,Nt,u.uv);Ct||(u.uv=h)}if(n){Et.fromBufferAttribute(n,s),Bt.fromBufferAttribute(n,i),Nt.fromBufferAttribute(n,c),u.uv1=new lt;let h=at.getInterpolation(ct,he,pe,ge,Et,Bt,Nt,u.uv1);Ct||(u.uv1=h),Ws&&(u.uv2=u.uv1)}if(t){ji.fromBufferAttribute(t,s),Qi.fromBufferAttribute(t,i),Ki.fromBufferAttribute(t,c),u.normal=new ee;let h=at.getInterpolation(ct,he,pe,ge,ji,Qi,Ki,u.normal);u.normal.dot(o.direction)>0&&u.normal.multiplyScalar(-1),Ct||(u.normal=h)}let a={a:s,b:i,c,normal:new ee,materialIndex:0};if(at.getNormal(he,pe,ge,a.normal),u.face=a,u.faceIndex=s,Ct){let h=new ee;at.getBarycoord(ct,he,pe,ge,h),u.barycoord=h}}return u}function Ji(o){return o&&o.isMaterial?o.side:o}function Oe(o,e,t,r,n,s,i){let c=r*3,l=c+0,m=c+1,f=c+2,{index:u,groups:a}=o;o.index&&(l=u.getX(l),m=u.getX(m),f=u.getX(f));let{position:h,normal:g,uv:y,uv1:d}=o.attributes;if(Array.isArray(e)){let b=r*3;for(let p=0,v=a.length;p<v;p++){let{start:x,count:T,materialIndex:S}=a[p];if(b>=x&&b<x+T){let w=Ji(e[S]),A=Zi(t,h,g,y,d,l,m,f,w,s,i);if(A)if(A.faceIndex=r,A.face.materialIndex=S,n)n.push(A);else return A}}}else{let b=Ji(e),p=Zi(t,h,g,y,d,l,m,f,b,s,i);if(p)if(p.faceIndex=r,p.face.materialIndex=0,n)n.push(p);else return p}return null}import{Vector2 as df,Vector3 as hf,Triangle as pf}from"three";function k(o,e,t,r){let n=o.a,s=o.b,i=o.c,c=e,l=e+1,m=e+2;t&&(c=t.getX(c),l=t.getX(l),m=t.getX(m)),n.x=r.getX(c),n.y=r.getY(c),n.z=r.getZ(c),s.x=r.getX(l),s.y=r.getY(l),s.z=r.getZ(l),i.x=r.getX(m),i.y=r.getY(m),i.z=r.getZ(m)}function to(o,e,t,r,n,s,i,c){let{geometry:l,_indirectBuffer:m}=o;for(let f=r,u=r+n;f<u;f++)Oe(l,e,t,f,s,i,c)}function ro(o,e,t,r,n,s,i){let{geometry:c,_indirectBuffer:l}=o,m=1/0,f=null;for(let u=r,a=r+n;u<a;u++){let h;h=Oe(c,e,t,u,null,s,i),h&&h.distance<m&&(f=h,m=h.distance)}return f}function io(o,e,t,r,n,s,i){let{geometry:c}=t,{index:l}=c,m=c.attributes.position;for(let f=o,u=e+o;f<u;f++){let a;if(a=f,k(i,a*3,l,m),i.needsUpdate=!0,r(i,a,n,s))return!0}return!1}function oo(o,e=null){e&&Array.isArray(e)&&(e=new Set(e));let t=o.geometry,r=t.index?t.index.array:null,n=t.attributes.position,s,i,c,l,m=0,f=o._roots;for(let a=0,h=f.length;a<h;a++)s=f[a],i=new Uint32Array(s),c=new Uint16Array(s),l=new Float32Array(s),u(0,m),m+=s.byteLength;function u(a,h,g=!1){let y=a*2;if(C(y,c)){let d=B(a,i),b=O(y,c),p=1/0,v=1/0,x=1/0,T=-1/0,S=-1/0,w=-1/0;for(let A=3*d,R=3*(d+b);A<R;A++){let _=r[A],P=n.getX(_),I=n.getY(_),F=n.getZ(_);P<p&&(p=P),P>T&&(T=P),I<v&&(v=I),I>S&&(S=I),F<x&&(x=F),F>w&&(w=F)}return l[a+0]!==p||l[a+1]!==v||l[a+2]!==x||l[a+3]!==T||l[a+4]!==S||l[a+5]!==w?(l[a+0]=p,l[a+1]=v,l[a+2]=x,l[a+3]=T,l[a+4]=S,l[a+5]=w,!0):!1}else{let d=N(a),b=L(a,i),p=g,v=!1,x=!1;if(e){if(!p){let _=d/8+h/32,P=b/8+h/32;v=e.has(_),x=e.has(P),p=!v&&!x}}else v=!0,x=!0;let T=p||v,S=p||x,w=!1;T&&(w=u(d,h,p));let A=!1;S&&(A=u(b,h,p));let R=w||A;if(R)for(let _=0;_<3;_++){let P=d+_,I=b+_,F=l[P],M=l[P+3],D=l[I],H=l[I+3];l[a+_]=F<D?F:D,l[a+_+3]=M>H?M:H}return R}}}function j(o,e,t,r,n){let s,i,c,l,m,f,u=1/t.direction.x,a=1/t.direction.y,h=1/t.direction.z,g=t.origin.x,y=t.origin.y,d=t.origin.z,b=e[o],p=e[o+3],v=e[o+1],x=e[o+3+1],T=e[o+2],S=e[o+3+2];return u>=0?(s=(b-g)*u,i=(p-g)*u):(s=(p-g)*u,i=(b-g)*u),a>=0?(c=(v-y)*a,l=(x-y)*a):(c=(x-y)*a,l=(v-y)*a),s>l||c>i||((c>s||isNaN(s))&&(s=c),(l<i||isNaN(i))&&(i=l),h>=0?(m=(T-d)*h,f=(S-d)*h):(m=(S-d)*h,f=(T-d)*h),s>f||m>i)?!1:((m>s||s!==s)&&(s=m),(f<i||i!==i)&&(i=f),s<=n&&i>=r)}function no(o,e,t,r,n,s,i,c){let{geometry:l,_indirectBuffer:m}=o;for(let f=r,u=r+n;f<u;f++){let a=m?m[f]:f;Oe(l,e,t,a,s,i,c)}}function so(o,e,t,r,n,s,i){let{geometry:c,_indirectBuffer:l}=o,m=1/0,f=null;for(let u=r,a=r+n;u<a;u++){let h;h=Oe(c,e,t,l?l[u]:u,null,s,i),h&&h.distance<m&&(f=h,m=h.distance)}return f}function ao(o,e,t,r,n,s,i){let{geometry:c}=t,{index:l}=c,m=c.attributes.position;for(let f=o,u=e+o;f<u;f++){let a;if(a=t.resolveTriangleIndex(f),k(i,a*3,l,m),i.needsUpdate=!0,r(i,a,n,s))return!0}return!1}function co(o,e,t,r,n,s,i){E.setBuffer(o._roots[e]),$r(0,o,t,r,n,s,i),E.clearBuffer()}function $r(o,e,t,r,n,s,i){let{float32Array:c,uint16Array:l,uint32Array:m}=E,f=o*2;if(C(f,l)){let a=B(o,m),h=O(f,l);to(e,t,r,a,h,n,s,i)}else{let a=N(o);j(a,c,r,s,i)&&$r(a,e,t,r,n,s,i);let h=L(o,m);j(h,c,r,s,i)&&$r(h,e,t,r,n,s,i)}}var qs=["x","y","z"];function lo(o,e,t,r,n,s){E.setBuffer(o._roots[e]);let i=Xr(0,o,t,r,n,s);return E.clearBuffer(),i}function Xr(o,e,t,r,n,s){let{float32Array:i,uint16Array:c,uint32Array:l}=E,m=o*2;if(C(m,c)){let u=B(o,l),a=O(m,c);return ro(e,t,r,u,a,n,s)}else{let u=ie(o,l),a=qs[u],g=r.direction[a]>=0,y,d;g?(y=N(o),d=L(o,l)):(y=L(o,l),d=N(o));let p=j(y,i,r,n,s)?Xr(y,e,t,r,n,s):null;if(p){let T=p.point[a];if(g?T<=i[d+u]:T>=i[d+u+3])return p}let x=j(d,i,r,n,s)?Xr(d,e,t,r,n,s):null;return p&&x?p.distance<=x.distance?p:x:p||x||null}}import{Box3 as Ys,Matrix4 as $s}from"three";var Lt=new Ys,ze=new G,ke=new G,ut=new $s,uo=new U,Ot=new U;function fo(o,e,t,r){E.setBuffer(o._roots[e]);let n=jr(0,o,t,r);return E.clearBuffer(),n}function jr(o,e,t,r,n=null){let{float32Array:s,uint16Array:i,uint32Array:c}=E,l=o*2;if(n===null&&(t.boundingBox||t.computeBoundingBox(),uo.set(t.boundingBox.min,t.boundingBox.max,r),n=uo),C(l,i)){let f=e.geometry,u=f.index,a=f.attributes.position,h=t.index,g=t.attributes.position,y=B(o,c),d=O(l,i);if(ut.copy(r).invert(),t.boundsTree)return z(o,s,Ot),Ot.matrix.copy(ut),Ot.needsUpdate=!0,t.boundsTree.shapecast({intersectsBounds:p=>Ot.intersectsBox(p),intersectsTriangle:p=>{p.a.applyMatrix4(r),p.b.applyMatrix4(r),p.c.applyMatrix4(r),p.needsUpdate=!0;for(let v=y*3,x=(d+y)*3;v<x;v+=3)if(k(ke,v,u,a),ke.needsUpdate=!0,p.intersectsTriangle(ke))return!0;return!1}});{let b=ce(t);for(let p=y*3,v=(d+y)*3;p<v;p+=3){k(ze,p,u,a),ze.a.applyMatrix4(ut),ze.b.applyMatrix4(ut),ze.c.applyMatrix4(ut),ze.needsUpdate=!0;for(let x=0,T=b*3;x<T;x+=3)if(k(ke,x,h,g),ke.needsUpdate=!0,ze.intersectsTriangle(ke))return!0}}}else{let f=N(o),u=L(o,c);return z(f,s,Lt),!!(n.intersectsBox(Lt)&&jr(f,e,t,r,n)||(z(u,s,Lt),n.intersectsBox(Lt)&&jr(u,e,t,r,n)))}}import{Matrix4 as Xs,Vector3 as kt}from"three";var zt=new Xs,Qr=new U,ft=new U,js=new kt,Qs=new kt,Ks=new kt,Zs=new kt;function mo(o,e,t,r={},n={},s=0,i=1/0){e.boundingBox||e.computeBoundingBox(),Qr.set(e.boundingBox.min,e.boundingBox.max,t),Qr.needsUpdate=!0;let c=o.geometry,l=c.attributes.position,m=c.index,f=e.attributes.position,u=e.index,a=q.getPrimitive(),h=q.getPrimitive(),g=js,y=Qs,d=null,b=null;n&&(d=Ks,b=Zs);let p=1/0,v=null,x=null;return zt.copy(t).invert(),ft.matrix.copy(zt),o.shapecast({boundsTraverseOrder:T=>Qr.distanceToBox(T),intersectsBounds:(T,S,w)=>w<p&&w<i?(S&&(ft.min.copy(T.min),ft.max.copy(T.max),ft.needsUpdate=!0),!0):!1,intersectsRange:(T,S)=>{if(e.boundsTree)return e.boundsTree.shapecast({boundsTraverseOrder:A=>ft.distanceToBox(A),intersectsBounds:(A,R,_)=>_<p&&_<i,intersectsRange:(A,R)=>{for(let _=A,P=A+R;_<P;_++){k(h,3*_,u,f),h.a.applyMatrix4(t),h.b.applyMatrix4(t),h.c.applyMatrix4(t),h.needsUpdate=!0;for(let I=T,F=T+S;I<F;I++){k(a,3*I,m,l),a.needsUpdate=!0;let M=a.distanceToTriangle(h,g,d);if(M<p&&(y.copy(g),b&&b.copy(d),p=M,v=I,x=_),M<s)return!0}}}});{let w=ce(e);for(let A=0,R=w;A<R;A++){k(h,3*A,u,f),h.a.applyMatrix4(t),h.b.applyMatrix4(t),h.c.applyMatrix4(t),h.needsUpdate=!0;for(let _=T,P=T+S;_<P;_++){k(a,3*_,m,l),a.needsUpdate=!0;let I=a.distanceToTriangle(h,g,d);if(I<p&&(y.copy(g),b&&b.copy(d),p=I,v=_,x=A),I<s)return!0}}}}}),q.releasePrimitive(a),q.releasePrimitive(h),p===1/0?null:(r.point?r.point.copy(y):r.point=y.clone(),r.distance=p,r.faceIndex=v,n&&(n.point?n.point.copy(b):n.point=b.clone(),n.point.applyMatrix4(zt),y.applyMatrix4(zt),n.distance=y.sub(n.point).length(),n.faceIndex=x),r)}function ho(o,e=null){e&&Array.isArray(e)&&(e=new Set(e));let t=o.geometry,r=t.index?t.index.array:null,n=t.attributes.position,s,i,c,l,m=0,f=o._roots;for(let a=0,h=f.length;a<h;a++)s=f[a],i=new Uint32Array(s),c=new Uint16Array(s),l=new Float32Array(s),u(0,m),m+=s.byteLength;function u(a,h,g=!1){let y=a*2;if(C(y,c)){let d=B(a,i),b=O(y,c),p=1/0,v=1/0,x=1/0,T=-1/0,S=-1/0,w=-1/0;for(let A=d,R=d+b;A<R;A++){let _=3*o.resolveTriangleIndex(A);for(let P=0;P<3;P++){let I=_+P;I=r?r[I]:I;let F=n.getX(I),M=n.getY(I),D=n.getZ(I);F<p&&(p=F),F>T&&(T=F),M<v&&(v=M),M>S&&(S=M),D<x&&(x=D),D>w&&(w=D)}}return l[a+0]!==p||l[a+1]!==v||l[a+2]!==x||l[a+3]!==T||l[a+4]!==S||l[a+5]!==w?(l[a+0]=p,l[a+1]=v,l[a+2]=x,l[a+3]=T,l[a+4]=S,l[a+5]=w,!0):!1}else{let d=N(a),b=L(a,i),p=g,v=!1,x=!1;if(e){if(!p){let _=d/8+h/32,P=b/8+h/32;v=e.has(_),x=e.has(P),p=!v&&!x}}else v=!0,x=!0;let T=p||v,S=p||x,w=!1;T&&(w=u(d,h,p));let A=!1;S&&(A=u(b,h,p));let R=w||A;if(R)for(let _=0;_<3;_++){let P=d+_,I=b+_,F=l[P],M=l[P+3],D=l[I],H=l[I+3];l[a+_]=F<D?F:D,l[a+_+3]=M>H?M:H}return R}}}function po(o,e,t,r,n,s,i){E.setBuffer(o._roots[e]),Kr(0,o,t,r,n,s,i),E.clearBuffer()}function Kr(o,e,t,r,n,s,i){let{float32Array:c,uint16Array:l,uint32Array:m}=E,f=o*2;if(C(f,l)){let a=B(o,m),h=O(f,l);no(e,t,r,a,h,n,s,i)}else{let a=N(o);j(a,c,r,s,i)&&Kr(a,e,t,r,n,s,i);let h=L(o,m);j(h,c,r,s,i)&&Kr(h,e,t,r,n,s,i)}}var Js=["x","y","z"];function go(o,e,t,r,n,s){E.setBuffer(o._roots[e]);let i=Zr(0,o,t,r,n,s);return E.clearBuffer(),i}function Zr(o,e,t,r,n,s){let{float32Array:i,uint16Array:c,uint32Array:l}=E,m=o*2;if(C(m,c)){let u=B(o,l),a=O(m,c);return so(e,t,r,u,a,n,s)}else{let u=ie(o,l),a=Js[u],g=r.direction[a]>=0,y,d;g?(y=N(o),d=L(o,l)):(y=L(o,l),d=N(o));let p=j(y,i,r,n,s)?Zr(y,e,t,r,n,s):null;if(p){let T=p.point[a];if(g?T<=i[d+u]:T>=i[d+u+3])return p}let x=j(d,i,r,n,s)?Zr(d,e,t,r,n,s):null;return p&&x?p.distance<=x.distance?p:x:p||x||null}}import{Box3 as ea,Matrix4 as ta}from"three";var Ht=new ea,He=new G,Ue=new G,mt=new ta,vo=new U,Ut=new U;function xo(o,e,t,r){E.setBuffer(o._roots[e]);let n=Jr(0,o,t,r);return E.clearBuffer(),n}function Jr(o,e,t,r,n=null){let{float32Array:s,uint16Array:i,uint32Array:c}=E,l=o*2;if(n===null&&(t.boundingBox||t.computeBoundingBox(),vo.set(t.boundingBox.min,t.boundingBox.max,r),n=vo),C(l,i)){let f=e.geometry,u=f.index,a=f.attributes.position,h=t.index,g=t.attributes.position,y=B(o,c),d=O(l,i);if(mt.copy(r).invert(),t.boundsTree)return z(o,s,Ut),Ut.matrix.copy(mt),Ut.needsUpdate=!0,t.boundsTree.shapecast({intersectsBounds:p=>Ut.intersectsBox(p),intersectsTriangle:p=>{p.a.applyMatrix4(r),p.b.applyMatrix4(r),p.c.applyMatrix4(r),p.needsUpdate=!0;for(let v=y,x=d+y;v<x;v++)if(k(Ue,3*e.resolveTriangleIndex(v),u,a),Ue.needsUpdate=!0,p.intersectsTriangle(Ue))return!0;return!1}});{let b=ce(t);for(let p=y,v=d+y;p<v;p++){let x=e.resolveTriangleIndex(p);k(He,3*x,u,a),He.a.applyMatrix4(mt),He.b.applyMatrix4(mt),He.c.applyMatrix4(mt),He.needsUpdate=!0;for(let T=0,S=b*3;T<S;T+=3)if(k(Ue,T,h,g),Ue.needsUpdate=!0,He.intersectsTriangle(Ue))return!0}}}else{let f=N(o),u=L(o,c);return z(f,s,Ht),!!(n.intersectsBox(Ht)&&Jr(f,e,t,r,n)||(z(u,s,Ht),n.intersectsBox(Ht)&&Jr(u,e,t,r,n)))}}import{Matrix4 as ra,Vector3 as Wt}from"three";var Vt=new ra,ei=new U,dt=new U,ia=new Wt,oa=new Wt,na=new Wt,sa=new Wt;function yo(o,e,t,r={},n={},s=0,i=1/0){e.boundingBox||e.computeBoundingBox(),ei.set(e.boundingBox.min,e.boundingBox.max,t),ei.needsUpdate=!0;let c=o.geometry,l=c.attributes.position,m=c.index,f=e.attributes.position,u=e.index,a=q.getPrimitive(),h=q.getPrimitive(),g=ia,y=oa,d=null,b=null;n&&(d=na,b=sa);let p=1/0,v=null,x=null;return Vt.copy(t).invert(),dt.matrix.copy(Vt),o.shapecast({boundsTraverseOrder:T=>ei.distanceToBox(T),intersectsBounds:(T,S,w)=>w<p&&w<i?(S&&(dt.min.copy(T.min),dt.max.copy(T.max),dt.needsUpdate=!0),!0):!1,intersectsRange:(T,S)=>{if(e.boundsTree){let w=e.boundsTree;return w.shapecast({boundsTraverseOrder:A=>dt.distanceToBox(A),intersectsBounds:(A,R,_)=>_<p&&_<i,intersectsRange:(A,R)=>{for(let _=A,P=A+R;_<P;_++){let I=w.resolveTriangleIndex(_);k(h,3*I,u,f),h.a.applyMatrix4(t),h.b.applyMatrix4(t),h.c.applyMatrix4(t),h.needsUpdate=!0;for(let F=T,M=T+S;F<M;F++){let D=o.resolveTriangleIndex(F);k(a,3*D,m,l),a.needsUpdate=!0;let H=a.distanceToTriangle(h,g,d);if(H<p&&(y.copy(g),b&&b.copy(d),p=H,v=F,x=_),H<s)return!0}}}})}else{let w=ce(e);for(let A=0,R=w;A<R;A++){k(h,3*A,u,f),h.a.applyMatrix4(t),h.b.applyMatrix4(t),h.c.applyMatrix4(t),h.needsUpdate=!0;for(let _=T,P=T+S;_<P;_++){let I=o.resolveTriangleIndex(_);k(a,3*I,m,l),a.needsUpdate=!0;let F=a.distanceToTriangle(h,g,d);if(F<p&&(y.copy(g),b&&b.copy(d),p=F,v=_,x=A),F<s)return!0}}}}}),q.releasePrimitive(a),q.releasePrimitive(h),p===1/0?null:(r.point?r.point.copy(y):r.point=y.clone(),r.distance=p,r.faceIndex=v,n&&(n.point?n.point.copy(b):n.point=b.clone(),n.point.applyMatrix4(Vt),y.applyMatrix4(Vt),n.distance=y.sub(n.point).length(),n.faceIndex=x),r)}function ti(o,e,t){return o===null?null:(o.point.applyMatrix4(e.matrixWorld),o.distance=o.point.distanceTo(t.ray.origin),o.object=e,o)}var Gt=new U,qt=new ca,To=new _o,wo=new la,So=new _o,ri=["getX","getY","getZ"],Yt=class o extends Dt{static serialize(e,t={}){t={cloneBuffers:!0,...t};let r=e.geometry,n=e._roots,s=e._indirectBuffer,i=r.getIndex(),c={version:1,roots:null,index:null,indirectBuffer:null};return t.cloneBuffers?(c.roots=n.map(l=>l.slice()),c.index=i?i.array.slice():null,c.indirectBuffer=s?s.slice():null):(c.roots=n,c.index=i?i.array:null,c.indirectBuffer=s),c}static deserialize(e,t,r={}){r={setIndex:!0,indirect:!!e.indirectBuffer,...r};let{index:n,roots:s,indirectBuffer:i}=e;e.version||(console.warn("MeshBVH.deserialize: Serialization format has been changed and will be fixed up. It is recommended to regenerate any stored serialized data."),l(s));let c=new o(t,{...r,[Je]:!0});if(c._roots=s,c._indirectBuffer=i||null,r.setIndex){let m=t.getIndex();if(m===null){let f=new aa(e.index,1,!1);t.setIndex(f)}else m.array!==n&&(m.array.set(n),m.needsUpdate=!0)}return c;function l(m){for(let f=0;f<m.length;f++){let u=m[f],a=new Uint32Array(u),h=new Uint16Array(u);for(let g=0,y=u.byteLength/32;g<y;g++){let d=8*g,b=2*d;C(b,h)||(a[d+6]=a[d+6]/8-g)}}}}get primitiveStride(){return 3}get resolveTriangleIndex(){return this.resolvePrimitiveIndex}constructor(e,t={}){t.maxLeafTris&&(console.warn('MeshBVH: "maxLeafTris" option has been deprecated. Use "targetLeafSize", instead.'),t={...t,targetLeafSize:t.maxLeafTris}),super(e,t)}shiftTriangleOffsets(e){return super.shiftPrimitiveOffsets(e)}writePrimitiveBounds(e,t,r){let n=this.geometry,s=this._indirectBuffer,i=n.attributes.position,c=n.index?n.index.array:null,m=(s?s[e]:e)*3,f=m+0,u=m+1,a=m+2;c&&(f=c[f],u=c[u],a=c[a]);for(let h=0;h<3;h++){let g=i[ri[h]](f),y=i[ri[h]](u),d=i[ri[h]](a),b=g;y<b&&(b=y),d<b&&(b=d);let p=g;y>p&&(p=y),d>p&&(p=d),t[r+h]=b,t[r+h+3]=p}return t}computePrimitiveBounds(e,t,r){let n=this.geometry,s=this._indirectBuffer,i=n.attributes.position,c=n.index?n.index.array:null,l=i.normalized;if(e<0||t+e-r.offset>r.length/6)throw new Error("MeshBVH: compute triangle bounds range is invalid.");let m=i.array,f=i.offset||0,u=3;i.isInterleavedBufferAttribute&&(u=i.data.stride);let a=["getX","getY","getZ"],h=r.offset;for(let g=e,y=e+t;g<y;g++){let b=(s?s[g]:g)*3,p=(g-h)*6,v=b+0,x=b+1,T=b+2;c&&(v=c[v],x=c[x],T=c[T]),l||(v=v*u+f,x=x*u+f,T=T*u+f);for(let S=0;S<3;S++){let w,A,R;l?(w=i[a[S]](v),A=i[a[S]](x),R=i[a[S]](T)):(w=m[v+S],A=m[x+S],R=m[T+S]);let _=w;A<_&&(_=A),R<_&&(_=R);let P=w;A>P&&(P=A),R>P&&(P=R);let I=(P-_)/2,F=S*2;r[p+F+0]=_+I,r[p+F+1]=I+(Math.abs(_)+I)*Pe}}return r}raycastObject3D(e,t,r=[]){let{material:n}=e;if(n===void 0)return;wo.copy(e.matrixWorld).invert(),qt.copy(t.ray).applyMatrix4(wo),So.setFromMatrixScale(e.matrixWorld),To.copy(qt.direction).multiply(So);let s=To.length(),i=t.near/s,c=t.far/s;if(t.firstHitOnly===!0){let l=this.raycastFirst(qt,n,i,c);l=ti(l,e,t),l&&r.push(l)}else{let l=this.raycast(qt,n,i,c);for(let m=0,f=l.length;m<f;m++){let u=ti(l[m],e,t);u&&r.push(u)}}return r}refit(e=null){return(this.indirect?ho:oo)(this,e)}raycast(e,t=bo,r=0,n=1/0){let s=this._roots,i=[],c=this.indirect?po:co;for(let l=0,m=s.length;l<m;l++)c(this,l,t,e,i,r,n);return i}raycastFirst(e,t=bo,r=0,n=1/0){let s=this._roots,i=null,c=this.indirect?go:lo;for(let l=0,m=s.length;l<m;l++){let f=c(this,l,t,e,r,n);f!=null&&(i==null||f.distance<i.distance)&&(i=f)}return i}intersectsGeometry(e,t){let r=!1,n=this._roots,s=this.indirect?xo:fo;for(let i=0,c=n.length;i<c&&(r=s(this,i,e,t),!r);i++);return r}shapecast(e){let t=q.getPrimitive(),r=super.shapecast({...e,intersectsPrimitive:e.intersectsTriangle,scratchPrimitive:t,iterate:this.indirect?ao:io});return q.releasePrimitive(t),r}bvhcast(e,t,r){let{intersectsRanges:n,intersectsTriangles:s}=r,i=q.getPrimitive(),c=this.geometry.index,l=this.geometry.attributes.position,m=this.indirect?g=>{let y=this.resolveTriangleIndex(g);k(i,y*3,c,l)}:g=>{k(i,g*3,c,l)},f=q.getPrimitive(),u=e.geometry.index,a=e.geometry.attributes.position,h=e.indirect?g=>{let y=e.resolveTriangleIndex(g);k(f,y*3,u,a)}:g=>{k(f,g*3,u,a)};if(s){if(!(e instanceof o))throw new Error('MeshBVH: "intersectsTriangles" callback can only be used with another MeshBVH.');let g=(y,d,b,p,v,x,T,S)=>{for(let w=b,A=b+p;w<A;w++){h(w),f.a.applyMatrix4(t),f.b.applyMatrix4(t),f.c.applyMatrix4(t),f.needsUpdate=!0;for(let R=y,_=y+d;R<_;R++)if(m(R),i.needsUpdate=!0,s(i,f,R,w,v,x,T,S))return!0}return!1};if(n){let y=n;n=function(d,b,p,v,x,T,S,w){return y(d,b,p,v,x,T,S,w)?!0:g(d,b,p,v,x,T,S,w)}}else n=g}return super.bvhcast(e,t,{intersectsRanges:n})}intersectsBox(e,t){return Gt.set(e.min,e.max,t),Gt.needsUpdate=!0,this.shapecast({intersectsBounds:r=>Gt.intersectsBox(r),intersectsTriangle:r=>Gt.intersectsTriangle(r)})}intersectsSphere(e){return this.shapecast({intersectsBounds:t=>e.intersectsBox(t),intersectsTriangle:t=>t.intersectsSphere(e)})}closestPointToGeometry(e,t,r={},n={},s=0,i=1/0){return(this.indirect?yo:mo)(this,e,t,r,n,s,i)}closestPointToPoint(e,t={},r=0,n=1/0){return Xi(this,e,t,r,n)}};import{DataTexture as Fo,FloatType as ya,UnsignedIntType as ba,RGBAFormat as Ta,RGIntegerFormat as wa,NearestFilter as Qt,BufferAttribute as Sa}from"three";import{DataTexture as ua,FloatType as $t,IntType as ii,UnsignedIntType as Xt,ByteType as Io,UnsignedByteType as Ao,ShortType as fa,UnsignedShortType as ma,RedFormat as da,RGFormat as ha,RGBAFormat as oi,RedIntegerFormat as pa,RGIntegerFormat as ga,RGBAIntegerFormat as ni,NearestFilter as Ro}from"three";function va(o){switch(o){case 1:return"R";case 2:return"RG";case 3:return"RGBA";case 4:return"RGBA"}throw new Error}function xa(o){switch(o){case 1:return da;case 2:return ha;case 3:return oi;case 4:return oi}}function Po(o){switch(o){case 1:return pa;case 2:return ga;case 3:return ni;case 4:return ni}}var jt=class extends ua{constructor(){super(),this.minFilter=Ro,this.magFilter=Ro,this.generateMipmaps=!1,this.overrideItemSize=null,this._forcedType=null}updateFrom(e){let t=this.overrideItemSize,r=e.itemSize,n=e.count;if(t!==null){if(r*n%t!==0)throw new Error("VertexAttributeTexture: overrideItemSize must divide evenly into buffer length.");e.itemSize=t,e.count=n*r/t}let s=e.itemSize,i=e.count,c=e.normalized,l=e.array.constructor,m=l.BYTES_PER_ELEMENT,f=this._forcedType,u=s;if(f===null)switch(l){case Float32Array:f=$t;break;case Uint8Array:case Uint16Array:case Uint32Array:f=Xt;break;case Int8Array:case Int16Array:case Int32Array:f=ii;break}let a,h,g,y,d=va(s);switch(f){case $t:g=1,h=xa(s),c&&m===1?(y=l,d+="8",l===Uint8Array?a=Ao:(a=Io,d+="_SNORM")):(y=Float32Array,d+="32F",a=$t);break;case ii:d+=m*8+"I",g=c?Math.pow(2,l.BYTES_PER_ELEMENT*8-1):1,h=Po(s),m===1?(y=Int8Array,a=Io):m===2?(y=Int16Array,a=fa):(y=Int32Array,a=ii);break;case Xt:d+=m*8+"UI",g=c?Math.pow(2,l.BYTES_PER_ELEMENT*8-1):1,h=Po(s),m===1?(y=Uint8Array,a=Ao):m===2?(y=Uint16Array,a=ma):(y=Uint32Array,a=Xt);break}u===3&&(h===oi||h===ni)&&(u=4);let b=Math.ceil(Math.sqrt(i))||1,p=u*b*b,v=new y(p),x=e.normalized;e.normalized=!1;for(let T=0;T<i;T++){let S=u*T;v[S]=e.getX(T)/g,s>=2&&(v[S+1]=e.getY(T)/g),s>=3&&(v[S+2]=e.getZ(T)/g,u===4&&(v[S+3]=1)),s>=4&&(v[S+3]=e.getW(T)/g)}e.normalized=x,this.internalFormat=d,this.format=h,this.type=a,this.image.width=b,this.image.height=b,this.image.data=v,this.needsUpdate=!0,this.dispose(),e.itemSize=r,e.count=n}},Ve=class extends jt{constructor(){super(),this._forcedType=Xt}};var We=class extends jt{constructor(){super(),this._forcedType=$t}};var Kt=class{constructor(){this.index=new Ve,this.position=new We,this.bvhBounds=new Fo,this.bvhContents=new Fo,this._cachedIndexAttr=null,this.index.overrideItemSize=3}updateFrom(e){let{geometry:t}=e;if(Ia(e,this.bvhBounds,this.bvhContents),this.position.updateFrom(t.attributes.position),e.indirect){let r=e._indirectBuffer;if(this._cachedIndexAttr===null||this._cachedIndexAttr.count!==r.length)if(t.index)this._cachedIndexAttr=t.index.clone();else{let n=Wr(ot(t));this._cachedIndexAttr=new Sa(n,1,!1)}_a(t,r,this._cachedIndexAttr),this.index.updateFrom(this._cachedIndexAttr)}else this.index.updateFrom(t.index)}dispose(){let{index:e,position:t,bvhBounds:r,bvhContents:n}=this;e&&e.dispose(),t&&t.dispose(),r&&r.dispose(),n&&n.dispose()}};function _a(o,e,t){let r=t.array,n=o.index?o.index.array:null;for(let s=0,i=e.length;s<i;s++){let c=3*s,l=3*e[s];for(let m=0;m<3;m++)r[c+m]=n?n[l+m]:l+m}}function Ia(o,e,t){let r=o._roots;if(r.length!==1)throw new Error("MeshBVHUniformStruct: Multi-root BVHs not supported.");let n=r[0],s=new Uint16Array(n),i=new Uint32Array(n),c=new Float32Array(n),l=n.byteLength/32,m=2*Math.ceil(Math.sqrt(l/2)),f=new Float32Array(4*m*m),u=Math.ceil(Math.sqrt(l)),a=new Uint32Array(2*u*u);for(let h=0;h<l;h++){let g=h*32/4,y=g*2,d=g;for(let b=0;b<3;b++)f[8*h+0+b]=c[d+0+b],f[8*h+4+b]=c[d+3+b];if(C(y,s)){let b=O(y,s),p=B(g,i),v=-65536|b;a[h*2+0]=v,a[h*2+1]=p}else{let b=i[g+6],p=ie(g,i);a[h*2+0]=p,a[h*2+1]=b}}e.image.data=f,e.image.width=m,e.image.height=m,e.format=Ta,e.type=ya,e.internalFormat="RGBA32F",e.minFilter=Qt,e.magFilter=Qt,e.generateMipmaps=!1,e.needsUpdate=!0,e.dispose(),t.image.data=a,t.image.width=u,t.image.height=u,t.format=wa,t.type=ba,t.internalFormat="RG32UI",t.minFilter=Qt,t.magFilter=Qt,t.generateMipmaps=!1,t.needsUpdate=!0,t.dispose()}var ve={};vs(ve,{bvh_distance_functions:()=>Mo,bvh_ray_functions:()=>ai,bvh_struct_definitions:()=>Do,common_functions:()=>si});var si=`

// A stack of uint32 indices can can store the indices for
// a perfectly balanced tree with a depth up to 31. Lower stack
// depth gets higher performance.
//
// However not all trees are balanced. Best value to set this to
// is the trees max depth.
#ifndef BVH_STACK_DEPTH
#define BVH_STACK_DEPTH 60
#endif

#ifndef INFINITY
#define INFINITY 1e20
#endif

// Utilities
uvec4 uTexelFetch1D( usampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

ivec4 iTexelFetch1D( isampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 texelFetch1D( sampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 textureSampleBarycoord( sampler2D tex, vec3 barycoord, uvec3 faceIndices ) {

	return
		barycoord.x * texelFetch1D( tex, faceIndices.x ) +
		barycoord.y * texelFetch1D( tex, faceIndices.y ) +
		barycoord.z * texelFetch1D( tex, faceIndices.z );

}

void ndcToCameraRay(
	vec2 coord, mat4 cameraWorld, mat4 invProjectionMatrix,
	out vec3 rayOrigin, out vec3 rayDirection
) {

	// get camera look direction and near plane for camera clipping
	vec4 lookDirection = cameraWorld * vec4( 0.0, 0.0, - 1.0, 0.0 );
	vec4 nearVector = invProjectionMatrix * vec4( 0.0, 0.0, - 1.0, 1.0 );
	float near = abs( nearVector.z / nearVector.w );

	// get the camera direction and position from camera matrices
	vec4 origin = cameraWorld * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec4 direction = invProjectionMatrix * vec4( coord, 0.5, 1.0 );
	direction /= direction.w;
	direction = cameraWorld * direction - origin;

	// slide the origin along the ray until it sits at the near clip plane position
	origin.xyz += direction.xyz * near / dot( direction, lookDirection );

	rayOrigin = origin.xyz;
	rayDirection = direction.xyz;

}
`;var Mo=`

float dot2( vec3 v ) {

	return dot( v, v );

}

// implementation from https://www.shadertoy.com/view/ttfGWl, though method 2 has been removed
// and is now available at this fork: https://www.shadertoy.com/view/WlB3zW
vec3 closestPointToTriangle( vec3 p, vec3 v0, vec3 v1, vec3 v2, out vec3 barycoord ) {

    vec3 v10 = v1 - v0;
    vec3 v21 = v2 - v1;
    vec3 v02 = v0 - v2;

	vec3 p0 = p - v0;
	vec3 p1 = p - v1;
	vec3 p2 = p - v2;

    vec3 nor = cross( v10, v02 );

    // method 2, in barycentric space
    vec3  q = cross( nor, p0 );
    float d = 1.0 / dot2( nor );
    float u = d * dot( q, v02 );
    float v = d * dot( q, v10 );
    float w = 1.0 - u - v;

	if( u < 0.0 ) {

		w = clamp( dot( p2, v02 ) / dot2( v02 ), 0.0, 1.0 );
		u = 0.0;
		v = 1.0 - w;

	} else if( v < 0.0 ) {

		u = clamp( dot( p0, v10 ) / dot2( v10 ), 0.0, 1.0 );
		v = 0.0;
		w = 1.0 - u;

	} else if( w < 0.0 ) {

		v = clamp( dot( p1, v21 ) / dot2( v21 ), 0.0, 1.0 );
		w = 0.0;
		u = 1.0 - v;

	}

	// output the barycoord in v0, v1, v2 weight order
	barycoord = vec3( w, u, v );
    return u * v1 + v * v2 + w * v0;

}

float distanceToTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// point and cut off range
	vec3 point, float closestDistanceSquared,

	// outputs
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord, inout float side, inout vec3 outPoint
) {

	bool found = false;
	vec3 localBarycoord;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		// get the closest point and barycoord
		vec3 closestPoint = closestPointToTriangle( point, a, b, c, localBarycoord );
		vec3 delta = point - closestPoint;
		float sqDist = dot2( delta );
		if ( sqDist < closestDistanceSquared ) {

			// set the output results
			closestDistanceSquared = sqDist;
			faceIndices = uvec4( indices.xyz, i );
			faceNormal = normalize( cross( a - b, b - c ) );
			barycoord = localBarycoord;
			outPoint = closestPoint;
			side = sign( dot( faceNormal, delta ) );

		}

	}

	return closestDistanceSquared;

}

float distanceSqToBounds( vec3 point, vec3 boundsMin, vec3 boundsMax ) {

	vec3 clampedPoint = clamp( point, boundsMin, boundsMax );
	vec3 delta = point - clampedPoint;
	return dot( delta, delta );

}

float distanceSqToBVHNodeBoundsPoint( vec3 point, sampler2D bvhBounds, uint currNodeIndex ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return distanceSqToBounds( point, boundsMin, boundsMax );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhClosestPointToPoint(		bvh,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)	_bvhClosestPointToPoint(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)

float _bvhClosestPointToPoint(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// point to check
	vec3 point, float maxDistance,

	// output variables
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout vec3 outPoint
 ) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int pointer = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float closestDistanceSquared = maxDistance * maxDistance;
	bool found = false;
	while ( pointer > - 1 && pointer < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ pointer ];
		pointer --;

		// check if we intersect the current bounds
		float boundsHitDistance = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, currNodeIndex );
		if ( boundsHitDistance > closestDistanceSquared ) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );
		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;
			closestDistanceSquared = distanceToTriangles(
				bvh_position, bvh_index, offset, count, point, closestDistanceSquared,

				// outputs
				faceIndices, faceNormal, barycoord, side, outPoint
			);

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = currNodeIndex + boundsInfo.y;
			bool leftToRight = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, leftIndex ) < distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, rightIndex );//rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			pointer ++;
			stack[ pointer ] = c2;
			pointer ++;
			stack[ pointer ] = c1;

		}

	}

	return sqrt( closestDistanceSquared );

}
`;var ai=`

#ifndef TRI_INTERSECT_EPSILON
#define TRI_INTERSECT_EPSILON 1e-5
#endif

// Raycasting
bool intersectsBounds( vec3 rayOrigin, vec3 rayDirection, vec3 boundsMin, vec3 boundsMax, out float dist ) {

	// https://www.reddit.com/r/opengl/comments/8ntzz5/fast_glsl_ray_box_intersection/
	// https://tavianator.com/2011/ray_box.html
	vec3 invDir = 1.0 / rayDirection;

	// find intersection distances for each plane
	vec3 tMinPlane = invDir * ( boundsMin - rayOrigin );
	vec3 tMaxPlane = invDir * ( boundsMax - rayOrigin );

	// get the min and max distances from each intersection
	vec3 tMinHit = min( tMaxPlane, tMinPlane );
	vec3 tMaxHit = max( tMaxPlane, tMinPlane );

	// get the furthest hit distance
	vec2 t = max( tMinHit.xx, tMinHit.yz );
	float t0 = max( t.x, t.y );

	// get the minimum hit distance
	t = min( tMaxHit.xx, tMaxHit.yz );
	float t1 = min( t.x, t.y );

	// set distance to 0.0 if the ray starts inside the box
	dist = max( t0, 0.0 );

	return t1 >= dist;

}

bool intersectsTriangle(
	vec3 rayOrigin, vec3 rayDirection, vec3 a, vec3 b, vec3 c,
	out vec3 barycoord, out vec3 norm, out float dist, out float side
) {

	// https://stackoverflow.com/questions/42740765/intersection-between-line-and-triangle-in-3d
	vec3 edge1 = b - a;
	vec3 edge2 = c - a;
	norm = cross( edge1, edge2 );

	float det = - dot( rayDirection, norm );
	float invdet = 1.0 / det;

	vec3 AO = rayOrigin - a;
	vec3 DAO = cross( AO, rayDirection );

	vec4 uvt;
	uvt.x = dot( edge2, DAO ) * invdet;
	uvt.y = - dot( edge1, DAO ) * invdet;
	uvt.z = dot( AO, norm ) * invdet;
	uvt.w = 1.0 - uvt.x - uvt.y;

	// set the hit information
	barycoord = uvt.wxy; // arranged in A, B, C order
	dist = uvt.z;
	side = sign( det );
	norm = side * normalize( norm );

	// add an epsilon to avoid misses between triangles
	uvt += vec4( TRI_INTERSECT_EPSILON );

	return all( greaterThanEqual( uvt, vec4( 0.0 ) ) );

}

bool intersectTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// outputs
	inout float minDistance, inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	bool found = false;
	vec3 localBarycoord, localNormal;
	float localDist, localSide;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		if (
			intersectsTriangle( rayOrigin, rayDirection, a, b, c, localBarycoord, localNormal, localDist, localSide )
			&& localDist < minDistance
		) {

			found = true;
			minDistance = localDist;

			faceIndices = uvec4( indices.xyz, i );
			faceNormal = localNormal;

			side = localSide;
			barycoord = localBarycoord;
			dist = localDist;

		}

	}

	return found;

}

bool intersectsBVHNodeBounds( vec3 rayOrigin, vec3 rayDirection, sampler2D bvhBounds, uint currNodeIndex, out float dist ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return intersectsBounds( rayOrigin, rayDirection, boundsMin, boundsMax, dist );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhIntersectFirstHit(		bvh,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)	_bvhIntersectFirstHit(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)

bool _bvhIntersectFirstHit(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// output variables split into separate variables due to output precision
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int pointer = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float triangleDistance = INFINITY;
	bool found = false;
	while ( pointer > - 1 && pointer < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ pointer ];
		pointer --;

		// check if we intersect the current bounds
		float boundsHitDistance;
		if (
			! intersectsBVHNodeBounds( rayOrigin, rayDirection, bvh_bvhBounds, currNodeIndex, boundsHitDistance )
			|| boundsHitDistance > triangleDistance
		) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );

		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;

			found = intersectTriangles(
				bvh_position, bvh_index, offset, count,
				rayOrigin, rayDirection, triangleDistance,
				faceIndices, faceNormal, barycoord, side, dist
			) || found;

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = currNodeIndex + boundsInfo.y;

			bool leftToRight = rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			pointer ++;
			stack[ pointer ] = c2;

			pointer ++;
			stack[ pointer ] = c1;

		}

	}

	return found;

}
`;var Do=`
struct BVH {

	usampler2D index;
	sampler2D position;

	sampler2D bvhBounds;
	usampler2D bvhContents;

};
`;var ld=`
	${si}
	${ai}
`;import{BufferAttribute as qo,BufferGeometry as Go,Mesh as ka,MeshBasicMaterial as Ha}from"three";import{BufferAttribute as Ra,BufferGeometry as Pa}from"three";import{BufferAttribute as Aa}from"three";function Zt(o,e,t=0){if(o.isInterleavedBufferAttribute){let r=o.itemSize;for(let n=0,s=o.count;n<s;n++){let i=n+t;e.setX(i,o.getX(n)),r>=2&&e.setY(i,o.getY(n)),r>=3&&e.setZ(i,o.getZ(n)),r>=4&&e.setW(i,o.getW(n))}}else{let r=e.array,n=r.constructor,s=r.BYTES_PER_ELEMENT*o.itemSize*t;new n(r.buffer,s,o.array.length).set(o.array)}}function xe(o,e=null){let t=o.array.constructor,r=o.normalized,n=o.itemSize,s=e===null?o.count:e;return new Aa(new t(n*s),n,r)}function ue(o,e){if(!o&&!e)return!0;if(!!o!=!!e)return!1;let t=o.count===e.count,r=o.normalized===e.normalized,n=o.array.constructor===e.array.constructor,s=o.itemSize===e.itemSize;return!(!t||!r||!n||!s)}function Fa(o){let e=o[0].index!==null,t=new Set(Object.keys(o[0].attributes));if(!o[0].getAttribute("position"))throw new Error("StaticGeometryGenerator: position attribute is required.");for(let r=0;r<o.length;++r){let n=o[r],s=0;if(e!==(n.index!==null))throw new Error("StaticGeometryGenerator: All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");for(let i in n.attributes){if(!t.has(i))throw new Error('StaticGeometryGenerator: All geometries must have compatible attributes; make sure "'+i+'" attribute exists among all geometries, or in none of them.');s++}if(s!==t.size)throw new Error("StaticGeometryGenerator: All geometries must have the same number of attributes.")}}function Ma(o){let e=0;for(let t=0,r=o.length;t<r;t++)e+=o[t].getIndex().count;return e}function Da(o){let e=0;for(let t=0,r=o.length;t<r;t++)e+=o[t].getAttribute("position").count;return e}function Ca(o,e,t){o.index&&o.index.count!==e&&o.setIndex(null);let r=o.attributes;for(let n in r)r[n].count!==t&&o.deleteAttribute(n)}function Co(o,e={},t=new Pa){let{useGroups:r=!1,forceUpdate:n=!1,skipAssigningAttributes:s=[],overwriteIndex:i=!0}=e;Fa(o);let c=o[0].index!==null,l=c?Ma(o):-1,m=Da(o);if(Ca(t,l,m),r){let u=0;for(let a=0,h=o.length;a<h;a++){let g=o[a],y;c?y=g.getIndex().count:y=g.getAttribute("position").count,t.addGroup(u,y,a),u+=y}}if(c){let u=!1;if(t.index||(t.setIndex(new Ra(new Uint32Array(l),1,!1)),u=!0),u||i){let a=0,h=0,g=t.getIndex();for(let y=0,d=o.length;y<d;y++){let b=o[y],p=b.getIndex();if(!(!n&&!u&&s[y]))for(let x=0;x<p.count;++x)g.setX(a+x,p.getX(x)+h);a+=p.count,h+=b.getAttribute("position").count}}}let f=Object.keys(o[0].attributes);for(let u=0,a=f.length;u<a;u++){let h=!1,g=f[u];if(!t.getAttribute(g)){let b=o[0].getAttribute(g);t.setAttribute(g,xe(b,m)),h=!0}let y=0,d=t.getAttribute(g);for(let b=0,p=o.length;b<p;b++){let v=o[b],x=!n&&!h&&s[b],T=v.getAttribute(g);if(!x)if(g==="color"&&d.itemSize!==T.itemSize)for(let S=y,w=T.count;S<w;S++)T.setXYZW(S,d.getX(S),d.getY(S),d.getZ(S),1);else Zt(T,d,y);y+=T.count}}}import{BufferAttribute as ht}from"three";function Eo(o,e,t){let r=o.index,s=o.attributes.position.count,i=r?r.count:s,c=o.groups;c.length===0&&(c=[{count:i,start:0,materialIndex:0}]);let l=o.getAttribute("materialIndex");if(!l||l.count!==s){let f;t.length<=255?f=new Uint8Array(s):f=new Uint16Array(s),l=new ht(f,1,!1),o.deleteAttribute("materialIndex"),o.setAttribute("materialIndex",l)}let m=l.array;for(let f=0;f<c.length;f++){let u=c[f],a=u.start,h=u.count,g=Math.min(h,i-a),y=Array.isArray(e)?e[u.materialIndex]:e,d=t.indexOf(y);for(let b=0;b<g;b++){let p=a+b;r&&(p=r.getX(p)),m[p]=d}}}function Bo(o,e){if(!o.index){let t=o.attributes.position.count,r=new Array(t);for(let n=0;n<t;n++)r[n]=n;o.setIndex(r)}if(!o.attributes.normal&&e&&e.includes("normal")&&o.computeVertexNormals(),!o.attributes.uv&&e&&e.includes("uv")){let t=o.attributes.position.count;o.setAttribute("uv",new ht(new Float32Array(t*2),2,!1))}if(!o.attributes.uv2&&e&&e.includes("uv2")){let t=o.attributes.position.count;o.setAttribute("uv2",new ht(new Float32Array(t*2),2,!1))}if(!o.attributes.tangent&&e&&e.includes("tangent"))if(o.attributes.uv&&o.attributes.normal)o.computeTangents();else{let t=o.attributes.position.count;o.setAttribute("tangent",new ht(new Float32Array(t*4),4,!1))}if(!o.attributes.color&&e&&e.includes("color")){let t=o.attributes.position.count,r=new Float32Array(t*4);r.fill(1),o.setAttribute("color",new ht(r,4))}}import{BufferGeometry as za}from"three";import{Matrix4 as Ea}from"three";function Ge(o){let e=0;if(o.byteLength!==0){let t=new Uint8Array(o);for(let r=0;r<o.byteLength;r++){let n=t[r];e=(e<<5)-e+n,e|=0}}return e}function No(o){let e=o.uuid,t=Object.values(o.attributes);o.index&&(t.push(o.index),e+=`index|${o.index.version}`);let r=Object.keys(t).sort();for(let n of r){let s=t[n];e+=`${n}_${s.version}|`}return e}function Lo(o){let e=o.skeleton;return e?(e.boneTexture||e.computeBoneTexture(),`${Ge(e.boneTexture.image.data.buffer)}_${e.boneTexture.uuid}`):null}var Jt=class{constructor(e=null){this.matrixWorld=new Ea,this.geometryHash=null,this.skeletonHash=null,this.primitiveCount=-1,e!==null&&this.updateFrom(e)}updateFrom(e){let t=e.geometry,r=(t.index?t.index.count:t.attributes.position.count)/3;this.matrixWorld.copy(e.matrixWorld),this.geometryHash=No(t),this.primitiveCount=r,this.skeletonHash=Lo(e)}didChange(e){let t=e.geometry,r=(t.index?t.index.count:t.attributes.position.count)/3;return!(this.matrixWorld.equals(e.matrixWorld)&&this.geometryHash===No(t)&&this.skeletonHash===Lo(e)&&this.primitiveCount===r)}};import{BufferGeometry as Ba,Matrix3 as Na,Matrix4 as Vo,Vector3 as pt,Vector4 as ui}from"three";var ye=new pt,be=new pt,Te=new pt,Oo=new ui,er=new pt,ci=new pt,zo=new ui,ko=new ui,tr=new Vo,Ho=new Vo;function Uo(o,e,t){let r=o.skeleton,n=o.geometry,s=r.bones,i=r.boneInverses;zo.fromBufferAttribute(n.attributes.skinIndex,e),ko.fromBufferAttribute(n.attributes.skinWeight,e),tr.elements.fill(0);for(let c=0;c<4;c++){let l=ko.getComponent(c);if(l!==0){let m=zo.getComponent(c);Ho.multiplyMatrices(s[m].matrixWorld,i[m]),La(tr,Ho,l)}}return tr.multiply(o.bindMatrix).premultiply(o.bindMatrixInverse),t.transformDirection(tr),t}function li(o,e,t,r,n){er.set(0,0,0);for(let s=0,i=o.length;s<i;s++){let c=e[s],l=o[s];c!==0&&(ci.fromBufferAttribute(l,r),t?er.addScaledVector(ci,c):er.addScaledVector(ci.sub(n),c))}n.add(er)}function La(o,e,t){let r=o.elements,n=e.elements;for(let s=0,i=n.length;s<i;s++)r[s]+=n[s]*t}function Oa(o){let{index:e,attributes:t}=o;if(e)for(let r=0,n=e.count;r<n;r+=3){let s=e.getX(r),i=e.getX(r+2);e.setX(r,i),e.setX(r+2,s)}else for(let r in t){let n=t[r],s=n.itemSize;for(let i=0,c=n.count;i<c;i+=3)for(let l=0;l<s;l++){let m=n.getComponent(i,l),f=n.getComponent(i+2,l);n.setComponent(i,l,f),n.setComponent(i+2,l,m)}}return o}function Wo(o,e={},t=new Ba){e={applyWorldTransforms:!0,attributes:[],...e};let r=o.geometry,n=e.applyWorldTransforms,s=e.attributes.includes("normal"),i=e.attributes.includes("tangent"),c=r.attributes,l=t.attributes;for(let p in t.attributes)(!e.attributes.includes(p)||!(p in r.attributes))&&t.deleteAttribute(p);!t.index&&r.index&&(t.index=r.index.clone()),l.position||t.setAttribute("position",xe(c.position)),s&&!l.normal&&c.normal&&t.setAttribute("normal",xe(c.normal)),i&&!l.tangent&&c.tangent&&t.setAttribute("tangent",xe(c.tangent)),ue(r.index,t.index),ue(c.position,l.position),s&&ue(c.normal,l.normal),i&&ue(c.tangent,l.tangent);let m=c.position,f=s?c.normal:null,u=i?c.tangent:null,a=r.morphAttributes.position,h=r.morphAttributes.normal,g=r.morphAttributes.tangent,y=r.morphTargetsRelative,d=o.morphTargetInfluences,b=new Na;b.getNormalMatrix(o.matrixWorld),r.index&&t.index.array.set(r.index.array);for(let p=0,v=c.position.count;p<v;p++)ye.fromBufferAttribute(m,p),f&&be.fromBufferAttribute(f,p),u&&(Oo.fromBufferAttribute(u,p),Te.fromBufferAttribute(u,p)),d&&(a&&li(a,d,y,p,ye),h&&li(h,d,y,p,be),g&&li(g,d,y,p,Te)),o.isSkinnedMesh&&(o.applyBoneTransform(p,ye),f&&Uo(o,p,be),u&&Uo(o,p,Te)),n&&ye.applyMatrix4(o.matrixWorld),l.position.setXYZ(p,ye.x,ye.y,ye.z),f&&(n&&be.applyNormalMatrix(b),l.normal.setXYZ(p,be.x,be.y,be.z)),u&&(n&&Te.transformDirection(o.matrixWorld),l.tangent.setXYZW(p,Te.x,Te.y,Te.z,Oo.w));for(let p in e.attributes){let v=e.attributes[p];v==="position"||v==="tangent"||v==="normal"||!(v in c)||(l[v]||t.setAttribute(v,xe(c[v])),ue(c[v],l[v]),Zt(c[v],l[v]))}return o.matrixWorld.determinant()<0&&Oa(t),t}var rr=class extends za{constructor(){super(),this.version=0,this.hash=null,this._diff=new Jt}isCompatible(e,t){let r=e.geometry;for(let n=0;n<t.length;n++){let s=t[n],i=r.attributes[s],c=this.attributes[s];if(i&&!ue(i,c))return!1}return!0}updateFrom(e,t){let r=this._diff;return r.didChange(e)?(Wo(e,t,this),r.updateFrom(e),this.version++,this.hash=`${this.uuid}_${this.version}`,!0):!1}};var or=0,fi=1,mi=2;function Ua(o,e){for(let t=0,r=o.length;t<r;t++)o[t].traverseVisible(s=>{s.isMesh&&e(s)})}function Va(o){let e=[];for(let t=0,r=o.length;t<r;t++){let n=o[t];Array.isArray(n.material)?e.push(...n.material):e.push(n.material)}return e}function Wa(o,e,t){if(o.length===0){e.setIndex(null);let r=e.attributes;for(let n in r)e.deleteAttribute(n);for(let n in t.attributes)e.setAttribute(t.attributes[n],new qo(new Float32Array(0),4,!1))}else Co(o,t,e);for(let r in e.attributes)e.attributes[r].needsUpdate=!0}var ir=class{constructor(e){this.objects=null,this.useGroups=!0,this.applyWorldTransforms=!0,this.generateMissingAttributes=!0,this.overwriteIndex=!0,this.attributes=["position","normal","color","tangent","uv","uv2"],this._intermediateGeometry=new Map,this._geometryMergeSets=new WeakMap,this._mergeOrder=[],this._dummyMesh=null,this.setObjects(e||[])}_getDummyMesh(){if(!this._dummyMesh){let e=new Ha,t=new Go;t.setAttribute("position",new qo(new Float32Array(9),3)),this._dummyMesh=new ka(t,e)}return this._dummyMesh}_getMeshes(){let e=[];return Ua(this.objects,t=>{e.push(t)}),e.sort((t,r)=>t.uuid>r.uuid?1:t.uuid<r.uuid?-1:0),e.length===0&&e.push(this._getDummyMesh()),e}_updateIntermediateGeometries(){let{_intermediateGeometry:e}=this,t=this._getMeshes(),r=new Set(e.keys()),n={attributes:this.attributes,applyWorldTransforms:this.applyWorldTransforms};for(let s=0,i=t.length;s<i;s++){let c=t[s],l=c.uuid;r.delete(l);let m=e.get(l);(!m||!m.isCompatible(c,this.attributes))&&(m&&m.dispose(),m=new rr,e.set(l,m)),m.updateFrom(c,n)&&this.generateMissingAttributes&&Bo(m,this.attributes)}r.forEach(s=>{e.delete(s)})}setObjects(e){Array.isArray(e)?this.objects=[...e]:this.objects=[e]}generate(e=new Go){let{useGroups:t,overwriteIndex:r,_intermediateGeometry:n,_geometryMergeSets:s}=this,i=this._getMeshes(),c=[],l=[],m=s.get(e)||[];this._updateIntermediateGeometries();let f=!1;i.length!==m.length&&(f=!0);for(let a=0,h=i.length;a<h;a++){let g=i[a],y=n.get(g.uuid);l.push(y);let d=m[a];!d||d.uuid!==y.uuid?(c.push(!1),f=!0):d.version!==y.version?c.push(!1):c.push(!0)}Wa(l,e,{useGroups:t,forceUpdate:f,skipAssigningAttributes:c,overwriteIndex:r}),f&&e.dispose(),s.set(e,l.map(a=>({version:a.version,uuid:a.uuid})));let u=or;return f?u=mi:c.includes(!1)&&(u=fi),{changeType:u,materials:Va(i),geometry:e}}};function qa(o){let e=new Set;for(let t=0,r=o.length;t<r;t++){let n=o[t];for(let s in n){let i=n[s];i&&i.isTexture&&e.add(i)}}return Array.from(e)}function Ya(o){let e=[],t=new Set;for(let n=0,s=o.length;n<s;n++)o[n].traverse(i=>{i.visible&&(i.isRectAreaLight||i.isSpotLight||i.isPointLight||i.isDirectionalLight)&&(e.push(i),i.iesMap&&t.add(i.iesMap))});let r=Array.from(t).sort((n,s)=>n.uuid<s.uuid?1:n.uuid>s.uuid?-1:0);return{lights:e,iesTextures:r}}var qe=class{get initialized(){return!!this.bvh}constructor(e){this.bvhOptions={},this.attributes=["position","normal","tangent","color","uv","uv2"],this.generateBVH=!0,this.bvh=null,this.geometry=new Ga,this.staticGeometryGenerator=new ir(e),this._bvhWorker=null,this._pendingGenerate=null,this._buildAsync=!1,this._materialUuids=null}setObjects(e){this.staticGeometryGenerator.setObjects(e)}setBVHWorker(e){this._bvhWorker=e}async generateAsync(e=null){if(!this._bvhWorker)throw new Error('PathTracingSceneGenerator: "setBVHWorker" must be called before "generateAsync" can be called.');if(this.bvh instanceof Promise)return this._pendingGenerate||(this._pendingGenerate=new Promise(async()=>(await this.bvh,this._pendingGenerate=null,this.generateAsync(e)))),this._pendingGenerate;{this._buildAsync=!0;let t=this.generate(e);return this._buildAsync=!1,t.bvh=this.bvh=await t.bvh,t}}generate(e=null){let{staticGeometryGenerator:t,geometry:r,attributes:n}=this,s=t.objects;t.attributes=n,s.forEach(a=>{a.traverse(h=>{h.isSkinnedMesh&&h.skeleton&&h.skeleton.update()})});let i=t.generate(r),c=i.materials,l=i.changeType!==or||this._materialUuids===null||this._materialUuids.length!==length;if(!l){for(let a=0,h=c.length;a<h;a++)if(c[a].uuid!==this._materialUuids[a]){l=!0;break}}let m=qa(c),{lights:f,iesTextures:u}=Ya(s);if(l&&(Eo(r,c,c),this._materialUuids=c.map(a=>a.uuid)),this.generateBVH){if(this.bvh instanceof Promise)throw new Error("PathTracingSceneGenerator: BVH is already building asynchronously.");if(i.changeType===mi){let a={strategy:2,maxLeafTris:1,indirect:!0,onProgress:e,...this.bvhOptions};this._buildAsync?this.bvh=this._bvhWorker.generate(r,a):this.bvh=new Yt(r,a)}else i.changeType===fi&&this.bvh.refit()}return{bvhChanged:i.changeType!==or,bvh:this.bvh,needsMaterialIndexUpdate:l,lights:f,iesTextures:u,geometry:r,materials:c,textures:m,objects:s}}},Yo=class extends qe{constructor(...e){super(...e),console.warn('DynamicPathTracingSceneGenerator has been deprecated and renamed to "PathTracingSceneGenerator".')}},$o=class extends qe{constructor(...e){super(...e),console.warn('PathTracingSceneWorker has been deprecated and renamed to "PathTracingSceneGenerator".')}};import{PerspectiveCamera as Sl,Scene as _l,Vector2 as rs,Clock as Il,NormalBlending as Al,NoBlending as es,AdditiveBlending as Rl}from"three";import{RGBAFormat as wi,FloatType as Si,Color as Kc,Vector2 as Zc,WebGLRenderTarget as _i,NoBlending as Jc,NormalBlending as el,Vector4 as Ii,NearestFilter as Qe}from"three";import{FullScreenQuad as Yn}from"three/examples/jsm/postprocessing/Pass.js";import{NoBlending as Xa}from"three";import{ShaderMaterial as $a}from"three";var Q=class extends $a{set needsUpdate(e){super.needsUpdate=!0,this.dispatchEvent({type:"recompilation"})}constructor(e){super(e);for(let t in this.uniforms)Object.defineProperty(this,t,{get(){return this.uniforms[t].value},set(r){this.uniforms[t].value=r}})}setDefine(e,t=void 0){if(t==null){if(e in this.defines)return delete this.defines[e],this.needsUpdate=!0,!0}else if(this.defines[e]!==t)return this.defines[e]=t,this.needsUpdate=!0,!0;return!1}};var nr=class extends Q{constructor(e){super({blending:Xa,uniforms:{target1:{value:null},target2:{value:null},opacity:{value:1}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				uniform float opacity;

				uniform sampler2D target1;
				uniform sampler2D target2;

				varying vec2 vUv;

				void main() {

					vec4 color1 = texture2D( target1, vUv );
					vec4 color2 = texture2D( target2, vUv );

					float invOpacity = 1.0 - opacity;
					float totalAlpha = color1.a * invOpacity + color2.a * opacity;

					if ( color1.a != 0.0 || color2.a != 0.0 ) {

						gl_FragColor.rgb = color1.rgb * ( invOpacity * color1.a / totalAlpha ) + color2.rgb * ( opacity * color2.a / totalAlpha );
						gl_FragColor.a = totalAlpha;

					} else {

						gl_FragColor = vec4( 0.0 );

					}

				}`}),this.setValues(e)}};import{FloatType as ja,NearestFilter as Qo,NoBlending as Qa,RGBAFormat as Ka,Vector2 as Za,WebGLRenderTarget as Ja}from"three";import{FullScreenQuad as ec}from"three/examples/jsm/postprocessing/Pass.js";function sr(o=1){let e="uint";return o>1&&(e="uvec"+o),`
		${e} sobolReverseBits( ${e} x ) {

			x = ( ( ( x & 0xaaaaaaaau ) >> 1 ) | ( ( x & 0x55555555u ) << 1 ) );
			x = ( ( ( x & 0xccccccccu ) >> 2 ) | ( ( x & 0x33333333u ) << 2 ) );
			x = ( ( ( x & 0xf0f0f0f0u ) >> 4 ) | ( ( x & 0x0f0f0f0fu ) << 4 ) );
			x = ( ( ( x & 0xff00ff00u ) >> 8 ) | ( ( x & 0x00ff00ffu ) << 8 ) );
			return ( ( x >> 16 ) | ( x << 16 ) );

		}

		${e} sobolHashCombine( uint seed, ${e} v ) {

			return seed ^ ( v + ${e}( ( seed << 6 ) + ( seed >> 2 ) ) );

		}

		${e} sobolLaineKarrasPermutation( ${e} x, ${e} seed ) {

			x += seed;
			x ^= x * 0x6c50b47cu;
			x ^= x * 0xb82f1e52u;
			x ^= x * 0xc7afe638u;
			x ^= x * 0x8d22f6e6u;
			return x;

		}

		${e} nestedUniformScrambleBase2( ${e} x, ${e} seed ) {

			x = sobolLaineKarrasPermutation( x, seed );
			x = sobolReverseBits( x );
			return x;

		}
	`}function ar(o=1){let e="uint",t="float",r="",n=".r",s="1u";return o>1&&(e="uvec"+o,t="vec"+o,r=o+"",o===2?(n=".rg",s="uvec2( 1u, 2u )"):o===3?(n=".rgb",s="uvec3( 1u, 2u, 3u )"):(n="",s="uvec4( 1u, 2u, 3u, 4u )")),`

		${t} sobol${r}( int effect ) {

			uint seed = sobolGetSeed( sobolBounceIndex, uint( effect ) );
			uint index = sobolPathIndex;

			uint shuffle_seed = sobolHashCombine( seed, 0u );
			uint shuffled_index = nestedUniformScrambleBase2( sobolReverseBits( index ), shuffle_seed );
			${t} sobol_pt = sobolGetTexturePoint( shuffled_index )${n};
			${e} result = ${e}( sobol_pt * 16777216.0 );

			${e} seed2 = sobolHashCombine( seed, ${s} );
			result = nestedUniformScrambleBase2( result, seed2 );

			return SOBOL_FACTOR * ${t}( result >> 8 );

		}
	`}var cr=`

	// Utils
	const float SOBOL_FACTOR = 1.0 / 16777216.0;
	const uint SOBOL_MAX_POINTS = 256u * 256u;

	${sr(1)}
	${sr(2)}
	${sr(3)}
	${sr(4)}

	uint sobolHash( uint x ) {

		// finalizer from murmurhash3
		x ^= x >> 16;
		x *= 0x85ebca6bu;
		x ^= x >> 13;
		x *= 0xc2b2ae35u;
		x ^= x >> 16;
		return x;

	}

`,Xo=`

	const uint SOBOL_DIRECTIONS_1[ 32 ] = uint[ 32 ](
		0x80000000u, 0xc0000000u, 0xa0000000u, 0xf0000000u,
		0x88000000u, 0xcc000000u, 0xaa000000u, 0xff000000u,
		0x80800000u, 0xc0c00000u, 0xa0a00000u, 0xf0f00000u,
		0x88880000u, 0xcccc0000u, 0xaaaa0000u, 0xffff0000u,
		0x80008000u, 0xc000c000u, 0xa000a000u, 0xf000f000u,
		0x88008800u, 0xcc00cc00u, 0xaa00aa00u, 0xff00ff00u,
		0x80808080u, 0xc0c0c0c0u, 0xa0a0a0a0u, 0xf0f0f0f0u,
		0x88888888u, 0xccccccccu, 0xaaaaaaaau, 0xffffffffu
	);

	const uint SOBOL_DIRECTIONS_2[ 32 ] = uint[ 32 ](
		0x80000000u, 0xc0000000u, 0x60000000u, 0x90000000u,
		0xe8000000u, 0x5c000000u, 0x8e000000u, 0xc5000000u,
		0x68800000u, 0x9cc00000u, 0xee600000u, 0x55900000u,
		0x80680000u, 0xc09c0000u, 0x60ee0000u, 0x90550000u,
		0xe8808000u, 0x5cc0c000u, 0x8e606000u, 0xc5909000u,
		0x6868e800u, 0x9c9c5c00u, 0xeeee8e00u, 0x5555c500u,
		0x8000e880u, 0xc0005cc0u, 0x60008e60u, 0x9000c590u,
		0xe8006868u, 0x5c009c9cu, 0x8e00eeeeu, 0xc5005555u
	);

	const uint SOBOL_DIRECTIONS_3[ 32 ] = uint[ 32 ](
		0x80000000u, 0xc0000000u, 0x20000000u, 0x50000000u,
		0xf8000000u, 0x74000000u, 0xa2000000u, 0x93000000u,
		0xd8800000u, 0x25400000u, 0x59e00000u, 0xe6d00000u,
		0x78080000u, 0xb40c0000u, 0x82020000u, 0xc3050000u,
		0x208f8000u, 0x51474000u, 0xfbea2000u, 0x75d93000u,
		0xa0858800u, 0x914e5400u, 0xdbe79e00u, 0x25db6d00u,
		0x58800080u, 0xe54000c0u, 0x79e00020u, 0xb6d00050u,
		0x800800f8u, 0xc00c0074u, 0x200200a2u, 0x50050093u
	);

	const uint SOBOL_DIRECTIONS_4[ 32 ] = uint[ 32 ](
		0x80000000u, 0x40000000u, 0x20000000u, 0xb0000000u,
		0xf8000000u, 0xdc000000u, 0x7a000000u, 0x9d000000u,
		0x5a800000u, 0x2fc00000u, 0xa1600000u, 0xf0b00000u,
		0xda880000u, 0x6fc40000u, 0x81620000u, 0x40bb0000u,
		0x22878000u, 0xb3c9c000u, 0xfb65a000u, 0xddb2d000u,
		0x78022800u, 0x9c0b3c00u, 0x5a0fb600u, 0x2d0ddb00u,
		0xa2878080u, 0xf3c9c040u, 0xdb65a020u, 0x6db2d0b0u,
		0x800228f8u, 0x400b3cdcu, 0x200fb67au, 0xb00ddb9du
	);

	uint getMaskedSobol( uint index, uint directions[ 32 ] ) {

		uint X = 0u;
		for ( int bit = 0; bit < 32; bit ++ ) {

			uint mask = ( index >> bit ) & 1u;
			X ^= mask * directions[ bit ];

		}
		return X;

	}

	vec4 generateSobolPoint( uint index ) {

		if ( index >= SOBOL_MAX_POINTS ) {

			return vec4( 0.0 );

		}

		// NOTE: this sobol "direction" is also available but we can't write out 5 components
		// uint x = index & 0x00ffffffu;
		uint x = sobolReverseBits( getMaskedSobol( index, SOBOL_DIRECTIONS_1 ) ) & 0x00ffffffu;
		uint y = sobolReverseBits( getMaskedSobol( index, SOBOL_DIRECTIONS_2 ) ) & 0x00ffffffu;
		uint z = sobolReverseBits( getMaskedSobol( index, SOBOL_DIRECTIONS_3 ) ) & 0x00ffffffu;
		uint w = sobolReverseBits( getMaskedSobol( index, SOBOL_DIRECTIONS_4 ) ) & 0x00ffffffu;

		return vec4( x, y, z, w ) * SOBOL_FACTOR;

	}

`,jo=`

	// Seeds
	uniform sampler2D sobolTexture;
	uint sobolPixelIndex = 0u;
	uint sobolPathIndex = 0u;
	uint sobolBounceIndex = 0u;

	uint sobolGetSeed( uint bounce, uint effect ) {

		return sobolHash(
			sobolHashCombine(
				sobolHashCombine(
					sobolHash( bounce ),
					sobolPixelIndex
				),
				effect
			)
		);

	}

	vec4 sobolGetTexturePoint( uint index ) {

		if ( index >= SOBOL_MAX_POINTS ) {

			index = index % SOBOL_MAX_POINTS;

		}

		uvec2 dim = uvec2( textureSize( sobolTexture, 0 ).xy );
		uint y = index / dim.x;
		uint x = index - y * dim.x;
		vec2 uv = vec2( x, y ) / vec2( dim );
		return texture( sobolTexture, uv );

	}

	${ar(1)}
	${ar(2)}
	${ar(3)}
	${ar(4)}

`;var di=class extends Q{constructor(){super({blending:Qa,uniforms:{resolution:{value:new Za}},vertexShader:`

				varying vec2 vUv;
				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}
			`,fragmentShader:`

				${cr}
				${Xo}

				varying vec2 vUv;
				uniform vec2 resolution;
				void main() {

					uint index = uint( gl_FragCoord.y ) * uint( resolution.x ) + uint( gl_FragCoord.x );
					gl_FragColor = generateSobolPoint( index );

				}
			`})}},lr=class{generate(e,t=256){let r=new Ja(t,t,{type:ja,format:Ka,minFilter:Qo,magFilter:Qo,generateMipmaps:!1}),n=e.getRenderTarget();e.setRenderTarget(r);let s=new ec(new di);return s.material.resolution.set(t,t),s.render(e),e.setRenderTarget(n),s.dispose(),r}};import{ClampToEdgeWrapping as Gn,HalfFloatType as jc,Matrix4 as Ir,Vector2 as Qc}from"three";import{PerspectiveCamera as tc}from"three";var ur=class extends tc{set bokehSize(e){this.fStop=this.getFocalLength()/e}get bokehSize(){return this.getFocalLength()/this.fStop}constructor(...e){super(...e),this.fStop=1.4,this.apertureBlades=0,this.apertureRotation=0,this.focusDistance=25,this.anamorphicRatio=1}copy(e,t){return super.copy(e,t),this.fStop=e.fStop,this.apertureBlades=e.apertureBlades,this.apertureRotation=e.apertureRotation,this.focusDistance=e.focusDistance,this.anamorphicRatio=e.anamorphicRatio,this}};var fr=class{constructor(){this.bokehSize=0,this.apertureBlades=0,this.apertureRotation=0,this.focusDistance=10,this.anamorphicRatio=1}updateFrom(e){e instanceof ur?(this.bokehSize=e.bokehSize,this.apertureBlades=e.apertureBlades,this.apertureRotation=e.apertureRotation,this.focusDistance=e.focusDistance,this.anamorphicRatio=e.anamorphicRatio):(this.bokehSize=0,this.apertureRotation=0,this.apertureBlades=0,this.focusDistance=10,this.anamorphicRatio=1)}};import{DataTexture as hi,RedFormat as Ko,LinearFilter as Ye,DataUtils as we,HalfFloatType as fe,Source as ic,RepeatWrapping as pi,RGBAFormat as oc,FloatType as nc,ClampToEdgeWrapping as sc}from"three";import{DataUtils as rc}from"three";function mr(o){let e=new Uint16Array(o.length);for(let t=0,r=o.length;t<r;++t)e[t]=rc.toHalfFloat(o[t]);return e}function Zo(o,e,t=0,r=o.length){let n=t,s=t+r-1;for(;n<s;){let i=n+s>>1;o[i]<e?n=i+1:s=i}return n-t}function ac(o,e,t){return .2126*o+.7152*e+.0722*t}function cc(o,e=fe){let t=o.clone();t.source=new ic({...t.image});let{width:r,height:n,data:s}=t.image,i=s;if(t.type!==e){e===fe?i=new Uint16Array(s.length):i=new Float32Array(s.length);let c;s instanceof Int8Array||s instanceof Int16Array||s instanceof Int32Array?c=2**(8*s.BYTES_PER_ELEMENT-1)-1:c=2**(8*s.BYTES_PER_ELEMENT)-1;for(let l=0,m=s.length;l<m;l++){let f=s[l];t.type===fe&&(f=we.fromHalfFloat(s[l])),t.type!==nc&&t.type!==fe&&(f/=c),e===fe&&(i[l]=we.toHalfFloat(f))}t.image.data=i,t.type=e}if(t.flipY){let c=i;i=i.slice();for(let l=0;l<n;l++)for(let m=0;m<r;m++){let f=n-l-1,u=4*(l*r+m),a=4*(f*r+m);i[a+0]=c[u+0],i[a+1]=c[u+1],i[a+2]=c[u+2],i[a+3]=c[u+3]}t.flipY=!1,t.image.data=i}return t}var dr=class{constructor(){let e=new hi(mr(new Float32Array([0,0,0,0])),1,1);e.type=fe,e.format=oc,e.minFilter=Ye,e.magFilter=Ye,e.wrapS=pi,e.wrapT=pi,e.generateMipmaps=!1,e.needsUpdate=!0;let t=new hi(mr(new Float32Array([0,1])),1,2);t.type=fe,t.format=Ko,t.minFilter=Ye,t.magFilter=Ye,t.generateMipmaps=!1,t.needsUpdate=!0;let r=new hi(mr(new Float32Array([0,0,1,1])),2,2);r.type=fe,r.format=Ko,r.minFilter=Ye,r.magFilter=Ye,r.generateMipmaps=!1,r.needsUpdate=!0,this.map=e,this.marginalWeights=t,this.conditionalWeights=r,this.totalSum=0}dispose(){this.marginalWeights.dispose(),this.conditionalWeights.dispose(),this.map.dispose()}updateFrom(e){let t=cc(e);t.wrapS=pi,t.wrapT=sc;let{width:r,height:n,data:s}=t.image,i=new Float32Array(r*n),c=new Float32Array(r*n),l=new Float32Array(n),m=new Float32Array(n),f=0,u=0;for(let d=0;d<n;d++){let b=0;for(let p=0;p<r;p++){let v=d*r+p,x=we.fromHalfFloat(s[4*v+0]),T=we.fromHalfFloat(s[4*v+1]),S=we.fromHalfFloat(s[4*v+2]),w=ac(x,T,S);b+=w,f+=w,i[v]=w,c[v]=b}if(b!==0)for(let p=d*r,v=d*r+r;p<v;p++)i[p]/=b,c[p]/=b;u+=b,l[d]=b,m[d]=u}if(u!==0)for(let d=0,b=l.length;d<b;d++)l[d]/=u,m[d]/=u;let a=new Uint16Array(n),h=new Uint16Array(r*n);for(let d=0;d<n;d++){let b=(d+1)/n,p=Zo(m,b);a[d]=we.toHalfFloat((p+.5)/n)}for(let d=0;d<n;d++)for(let b=0;b<r;b++){let p=d*r+b,v=(b+1)/r,x=Zo(c,v,d*r,r);h[p]=we.toHalfFloat((x+.5)/r)}this.dispose();let{marginalWeights:g,conditionalWeights:y}=this;g.image={width:n,height:1,data:a},g.needsUpdate=!0,y.image={width:r,height:n,data:h},y.needsUpdate=!0,this.totalSum=f,this.map=t}};import{DataTexture as lc,RGBAFormat as uc,ClampToEdgeWrapping as Jo,FloatType as fc,Vector3 as gt,Quaternion as mc,Matrix4 as dc,NearestFilter as en}from"three";var gi=6,hc=0,pc=1,gc=2,vc=3,xc=4,J=new gt,Y=new gt,tn=new dc,$e=new mc,rn=new gt,Xe=new gt,yc=new gt(0,1,0),hr=class{constructor(){let e=new lc(new Float32Array(4),1,1);e.format=uc,e.type=fc,e.wrapS=Jo,e.wrapT=Jo,e.generateMipmaps=!1,e.minFilter=en,e.magFilter=en,this.tex=e,this.count=0}updateFrom(e,t=[]){let r=this.tex,n=Math.max(e.length*gi,1),s=Math.ceil(Math.sqrt(n));r.image.width!==s&&(r.dispose(),r.image.data=new Float32Array(s*s*4),r.image.width=s,r.image.height=s);let i=r.image.data;for(let l=0,m=e.length;l<m;l++){let f=e[l],u=l*gi*4,a=0;for(let g=0;g<gi*4;g++)i[u+g]=0;f.getWorldPosition(Y),i[u+a++]=Y.x,i[u+a++]=Y.y,i[u+a++]=Y.z;let h=hc;if(f.isRectAreaLight&&f.isCircular?h=pc:f.isSpotLight?h=gc:f.isDirectionalLight?h=vc:f.isPointLight&&(h=xc),i[u+a++]=h,i[u+a++]=f.color.r,i[u+a++]=f.color.g,i[u+a++]=f.color.b,i[u+a++]=f.intensity,f.getWorldQuaternion($e),f.isRectAreaLight)J.set(f.width,0,0).applyQuaternion($e),i[u+a++]=J.x,i[u+a++]=J.y,i[u+a++]=J.z,a++,Y.set(0,f.height,0).applyQuaternion($e),i[u+a++]=Y.x,i[u+a++]=Y.y,i[u+a++]=Y.z,i[u+a++]=J.cross(Y).length()*(f.isCircular?Math.PI/4:1);else if(f.isSpotLight){let g=f.radius||0;rn.setFromMatrixPosition(f.matrixWorld),Xe.setFromMatrixPosition(f.target.matrixWorld),tn.lookAt(rn,Xe,yc),$e.setFromRotationMatrix(tn),J.set(1,0,0).applyQuaternion($e),i[u+a++]=J.x,i[u+a++]=J.y,i[u+a++]=J.z,a++,Y.set(0,1,0).applyQuaternion($e),i[u+a++]=Y.x,i[u+a++]=Y.y,i[u+a++]=Y.z,i[u+a++]=Math.PI*g*g,i[u+a++]=g,i[u+a++]=f.decay,i[u+a++]=f.distance,i[u+a++]=Math.cos(f.angle),i[u+a++]=Math.cos(f.angle*(1-f.penumbra)),i[u+a++]=f.iesMap?t.indexOf(f.iesMap):-1}else if(f.isPointLight){let g=J.setFromMatrixPosition(f.matrixWorld);i[u+a++]=g.x,i[u+a++]=g.y,i[u+a++]=g.z,a++,a+=4,a+=1,i[u+a++]=f.decay,i[u+a++]=f.distance}else if(f.isDirectionalLight){let g=J.setFromMatrixPosition(f.matrixWorld),y=Y.setFromMatrixPosition(f.target.matrixWorld);Xe.subVectors(g,y).normalize(),i[u+a++]=Xe.x,i[u+a++]=Xe.y,i[u+a++]=Xe.z}}this.count=e.length;let c=Ge(i.buffer);return this.hash!==c?(this.hash=c,r.needsUpdate=!0,!0):!1}};import{DataArrayTexture as bc,FloatType as Tc,RGBAFormat as wc}from"three";function on(o,e,t,r,n){if(e>r)throw new Error;let s=o.length/e,i=o.constructor.BYTES_PER_ELEMENT*8,c=1;switch(o.constructor){case Uint8Array:case Uint16Array:case Uint32Array:c=2**i-1;break;case Int8Array:case Int16Array:case Int32Array:c=2**(i-1)-1;break}for(let l=0;l<s;l++){let m=4*l,f=e*l;for(let u=0;u<r;u++)t[n+m+u]=e>=u+1?o[f+u]/c:0}}var pr=class extends bc{constructor(){super(),this._textures=[],this.type=Tc,this.format=wc,this.internalFormat="RGBA32F"}updateAttribute(e,t){let r=this._textures[e];r.updateFrom(t);let n=r.image,s=this.image;if(n.width!==s.width||n.height!==s.height)throw new Error("FloatAttributeTextureArray: Attribute must be the same dimensions when updating single layer.");let{width:i,height:c,data:l}=s,f=i*c*4*e,u=t.itemSize;u===3&&(u=4),on(r.image.data,u,l,4,f),this.dispose(),this.needsUpdate=!0}setAttributes(e){let t=e[0].count,r=e.length;for(let u=0,a=r;u<a;u++)if(e[u].count!==t)throw new Error("FloatAttributeTextureArray: All attributes must have the same item count.");let n=this._textures;for(;n.length<r;){let u=new We;n.push(u)}for(;n.length>r;)n.pop();for(let u=0,a=r;u<a;u++)n[u].updateFrom(e[u]);let i=n[0].image,c=this.image;(i.width!==c.width||i.height!==c.height||i.depth!==r)&&(c.width=i.width,c.height=i.height,c.depth=r,c.data=new Float32Array(c.width*c.height*c.depth*4));let{data:l,width:m,height:f}=c;for(let u=0,a=r;u<a;u++){let h=n[u],y=m*f*4*u,d=e[u].itemSize;d===3&&(d=4),on(h.image.data,d,l,4,y)}this.dispose(),this.needsUpdate=!0}};var gr=class extends pr{updateNormalAttribute(e){this.updateAttribute(0,e)}updateTangentAttribute(e){this.updateAttribute(1,e)}updateUvAttribute(e){this.updateAttribute(2,e)}updateColorAttribute(e){this.updateAttribute(3,e)}updateFrom(e,t,r,n){this.setAttributes([e,t,r,n])}};import{DataTexture as _c,RGBAFormat as Ic,ClampToEdgeWrapping as cn,FloatType as Ac,FrontSide as Rc,BackSide as Pc,DoubleSide as Fc,NearestFilter as ln}from"three";function vi(o,e){return o.uuid<e.uuid?1:o.uuid>e.uuid?-1:0}function vr(o){return`${o.source.uuid}:${o.colorSpace}`}function Sc(o){let e=new Set,t=[];for(let r=0,n=o.length;r<n;r++){let s=o[r],i=vr(s);e.has(i)||(e.add(i),t.push(s))}return t}function nn(o){let e=o.map(r=>r.iesMap||null).filter(r=>r),t=new Set(e);return Array.from(t).sort(vi)}function sn(o){let e=new Set;for(let r=0,n=o.length;r<n;r++){let s=o[r];for(let i in s){let c=s[i];c&&c.isTexture&&e.add(c)}}let t=Array.from(e);return Sc(t).sort(vi)}function an(o){let e=[];return o.traverse(t=>{t.visible&&(t.isRectAreaLight||t.isSpotLight||t.isPointLight||t.isDirectionalLight)&&e.push(t)}),e.sort(vi)}var yr=47,un=yr*4,xi=class{constructor(){this._features={}}isUsed(e){return e in this._features}setUsed(e,t=!0){t===!1?delete this._features[e]:this._features[e]=!0}reset(){this._features={}}},xr=class extends _c{constructor(){super(new Float32Array(4),1,1),this.format=Ic,this.type=Ac,this.wrapS=cn,this.wrapT=cn,this.minFilter=ln,this.magFilter=ln,this.generateMipmaps=!1,this.features=new xi}updateFrom(e,t){function r(g,y,d=-1){if(y in g&&g[y]){let b=vr(g[y]);return u[b]}else return d}function n(g,y,d){return y in g?g[y]:d}function s(g,y,d,b){let p=g[y]&&g[y].isTexture?g[y]:null;if(p){p.matrixAutoUpdate&&p.updateMatrix();let v=p.matrix.elements,x=0;d[b+x++]=v[0],d[b+x++]=v[3],d[b+x++]=v[6],x++,d[b+x++]=v[1],d[b+x++]=v[4],d[b+x++]=v[7],x++}return 8}let i=0,c=e.length*yr,l=Math.ceil(Math.sqrt(c))||1,{image:m,features:f}=this,u={};for(let g=0,y=t.length;g<y;g++)u[vr(t[g])]=g;m.width!==l&&(this.dispose(),m.data=new Float32Array(l*l*4),m.width=l,m.height=l);let a=m.data;f.reset();for(let g=0,y=e.length;g<y;g++){let d=e[g];if(d.isFogVolumeMaterial){f.setUsed("FOG");for(let v=0;v<un;v++)a[i+v]=0;a[i+0*4+0]=d.color.r,a[i+0*4+1]=d.color.g,a[i+0*4+2]=d.color.b,a[i+2*4+3]=n(d,"emissiveIntensity",0),a[i+3*4+0]=d.emissive.r,a[i+3*4+1]=d.emissive.g,a[i+3*4+2]=d.emissive.b,a[i+13*4+1]=d.density,a[i+13*4+3]=0,a[i+14*4+2]=4,i+=un;continue}a[i++]=d.color.r,a[i++]=d.color.g,a[i++]=d.color.b,a[i++]=r(d,"map"),a[i++]=n(d,"metalness",0),a[i++]=r(d,"metalnessMap"),a[i++]=n(d,"roughness",0),a[i++]=r(d,"roughnessMap"),a[i++]=n(d,"ior",1.5),a[i++]=n(d,"transmission",0),a[i++]=r(d,"transmissionMap"),a[i++]=n(d,"emissiveIntensity",0),"emissive"in d?(a[i++]=d.emissive.r,a[i++]=d.emissive.g,a[i++]=d.emissive.b):(a[i++]=0,a[i++]=0,a[i++]=0),a[i++]=r(d,"emissiveMap"),a[i++]=r(d,"normalMap"),"normalScale"in d?(a[i++]=d.normalScale.x,a[i++]=d.normalScale.y):(a[i++]=1,a[i++]=1),a[i++]=n(d,"clearcoat",0),a[i++]=r(d,"clearcoatMap"),a[i++]=n(d,"clearcoatRoughness",0),a[i++]=r(d,"clearcoatRoughnessMap"),a[i++]=r(d,"clearcoatNormalMap"),"clearcoatNormalScale"in d?(a[i++]=d.clearcoatNormalScale.x,a[i++]=d.clearcoatNormalScale.y):(a[i++]=1,a[i++]=1),i++,a[i++]=n(d,"sheen",0),"sheenColor"in d?(a[i++]=d.sheenColor.r,a[i++]=d.sheenColor.g,a[i++]=d.sheenColor.b):(a[i++]=0,a[i++]=0,a[i++]=0),a[i++]=r(d,"sheenColorMap"),a[i++]=n(d,"sheenRoughness",0),a[i++]=r(d,"sheenRoughnessMap"),a[i++]=r(d,"iridescenceMap"),a[i++]=r(d,"iridescenceThicknessMap"),a[i++]=n(d,"iridescence",0),a[i++]=n(d,"iridescenceIOR",1.3);let b=n(d,"iridescenceThicknessRange",[100,400]);a[i++]=b[0],a[i++]=b[1],"specularColor"in d?(a[i++]=d.specularColor.r,a[i++]=d.specularColor.g,a[i++]=d.specularColor.b):(a[i++]=1,a[i++]=1,a[i++]=1),a[i++]=r(d,"specularColorMap"),a[i++]=n(d,"specularIntensity",1),a[i++]=r(d,"specularIntensityMap");let p=n(d,"thickness",0)===0&&n(d,"attenuationDistance",1/0)===1/0;if(a[i++]=Number(p),i++,"attenuationColor"in d?(a[i++]=d.attenuationColor.r,a[i++]=d.attenuationColor.g,a[i++]=d.attenuationColor.b):(a[i++]=1,a[i++]=1,a[i++]=1),a[i++]=n(d,"attenuationDistance",1/0),a[i++]=r(d,"alphaMap"),a[i++]=d.opacity,a[i++]=d.alphaTest,!p&&d.transmission>0)a[i++]=0;else switch(d.side){case Rc:a[i++]=1;break;case Pc:a[i++]=-1;break;case Fc:a[i++]=0;break}a[i++]=Number(n(d,"matte",!1)),a[i++]=Number(n(d,"castShadow",!0)),a[i++]=Number(d.vertexColors)|Number(d.flatShading)<<1,a[i++]=Number(d.transparent),i+=s(d,"map",a,i),i+=s(d,"metalnessMap",a,i),i+=s(d,"roughnessMap",a,i),i+=s(d,"transmissionMap",a,i),i+=s(d,"emissiveMap",a,i),i+=s(d,"normalMap",a,i),i+=s(d,"clearcoatMap",a,i),i+=s(d,"clearcoatNormalMap",a,i),i+=s(d,"clearcoatRoughnessMap",a,i),i+=s(d,"sheenColorMap",a,i),i+=s(d,"sheenRoughnessMap",a,i),i+=s(d,"iridescenceMap",a,i),i+=s(d,"iridescenceThicknessMap",a,i),i+=s(d,"specularColorMap",a,i),i+=s(d,"specularIntensityMap",a,i),i+=s(d,"alphaMap",a,i)}let h=Ge(a.buffer);return this.hash!==h?(this.hash=h,this.needsUpdate=!0,!0):!1}};import{WebGLArrayRenderTarget as Mc,RGBAFormat as Dc,UnsignedByteType as Cc,Color as Ec,RepeatWrapping as fn,LinearFilter as mn,NoToneMapping as Bc,ShaderMaterial as Nc}from"three";import{FullScreenQuad as Lc}from"three/examples/jsm/postprocessing/Pass.js";var dn=new Ec;function Oc(o){return o?`${o.uuid}:${o.version}`:null}function zc(o,e){for(let t in e)t in o&&(o[t]=e[t])}var vt=class extends Mc{constructor(e,t,r){let n={format:Dc,type:Cc,minFilter:mn,magFilter:mn,wrapS:fn,wrapT:fn,generateMipmaps:!1,...r};super(e,t,1,n),zc(this.texture,n),this.texture.setTextures=(...i)=>{this.setTextures(...i)},this.hashes=[null];let s=new Lc(new yi);this.fsQuad=s}setTextures(e,t,r=this.width,n=this.height){let s=e.getRenderTarget(),i=e.toneMapping,c=e.getClearAlpha();e.getClearColor(dn);let l=t.length||1;(r!==this.width||n!==this.height||this.depth!==l)&&(this.setSize(r,n,l),this.hashes=new Array(l).fill(null)),e.setClearColor(0,0),e.toneMapping=Bc;let m=this.fsQuad,f=this.hashes,u=!1;for(let a=0,h=l;a<h;a++){let g=t[a],y=Oc(g);g&&(f[a]!==y||g.isWebGLRenderTarget)&&(g.matrixAutoUpdate=!1,g.matrix.identity(),m.material.map=g,e.setRenderTarget(this,a),m.render(e),g.updateMatrix(),g.matrixAutoUpdate=!0,f[a]=y,u=!0)}return m.material.map=null,e.setClearColor(dn,c),e.setRenderTarget(s),e.toneMapping=i,u}dispose(){super.dispose(),this.fsQuad.dispose()}},yi=class extends Nc{get map(){return this.uniforms.map.value}set map(e){this.uniforms.map.value=e}constructor(){super({uniforms:{map:{value:null}},vertexShader:`
				varying vec2 vUv;
				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}
			`,fragmentShader:`
				uniform sampler2D map;
				varying vec2 vUv;
				void main() {

					gl_FragColor = texture2D( map, vUv );

				}
			`})}};import{DataTexture as Hc,FloatType as Uc,NearestFilter as hn,RGBAFormat as Vc}from"three";function kc(o,e=Math.random()){for(let t=o.length-1;t>0;t--){let r=Math.floor(e()*(t+1)),n=o[t];o[t]=o[r],o[r]=n}return o}var br=class{constructor(e,t,r=Math.random){let n=e**t,s=new Uint16Array(n),i=n;for(let c=0;c<n;c++)s[c]=c;this.samples=new Float32Array(t),this.strataCount=e,this.reset=function(){for(let c=0;c<n;c++)s[c]=c;i=0},this.reshuffle=function(){i=0},this.next=function(){let{samples:c}=this;i>=s.length&&(kc(s,r),this.reshuffle());let l=s[i++];for(let m=0;m<t;m++)c[m]=(l%e+r())/e,l=Math.floor(l/e);return c}}};var Tr=class{constructor(e,t,r=Math.random){let n=0;for(let l of t)n+=l;let s=new Float32Array(n),i=[],c=0;for(let l of t){let m=new br(e,l,r);m.samples=new Float32Array(s.buffer,c,m.samples.length),c+=m.samples.length*4,i.push(m)}this.samples=s,this.strataCount=e,this.next=function(){for(let l of i)l.next();return s},this.reshuffle=function(){for(let l of i)l.reshuffle()},this.reset=function(){for(let l of i)l.reset()}}};var bi=class{constructor(e=0){this.m=2147483648,this.a=1103515245,this.c=12345,this.seed=e}nextInt(){return this.seed=(this.a*this.seed+this.c)%this.m,this.seed}nextFloat(){return this.nextInt()/(this.m-1)}},wr=class extends Hc{constructor(e=1,t=1,r=8){super(new Float32Array(1),1,1,Vc,Uc),this.minFilter=hn,this.magFilter=hn,this.strata=r,this.sampler=null,this.generator=new bi,this.stableNoise=!1,this.random=()=>this.stableNoise?this.generator.nextFloat():Math.random(),this.init(e,t,r)}init(e=this.image.height,t=this.image.width,r=this.strata){let{image:n}=this;if(n.width===t&&n.height===e&&this.sampler!==null)return;let s=new Array(e*t).fill(4),i=new Tr(r,s,this.random);n.width=t,n.height=e,n.data=i.samples,this.sampler=i,this.dispose(),this.next()}next(){this.sampler.next(),this.needsUpdate=!0}reset(){this.sampler.reset(),this.generator.seed=0}};import{DataTexture as Wc,FloatType as Gc,NearestFilter as vn,RGBAFormat as xn,RGFormat as qc,RedFormat as Yc}from"three";function pn(o,e=Math.random){for(let t=o.length-1;t>0;t--){let r=~~((e()-1e-6)*t),n=o[t];o[t]=o[r],o[r]=n}}function gn(o,e){o.fill(0);for(let t=0;t<e;t++)o[t]=1}var xt=class{constructor(e){this.count=0,this.size=-1,this.sigma=-1,this.radius=-1,this.lookupTable=null,this.score=null,this.binaryPattern=null,this.resize(e),this.setSigma(1.5)}findVoid(){let{score:e,binaryPattern:t}=this,r=1/0,n=-1;for(let s=0,i=t.length;s<i;s++){if(t[s]!==0)continue;let c=e[s];c<r&&(r=c,n=s)}return n}findCluster(){let{score:e,binaryPattern:t}=this,r=-1/0,n=-1;for(let s=0,i=t.length;s<i;s++){if(t[s]!==1)continue;let c=e[s];c>r&&(r=c,n=s)}return n}setSigma(e){if(e===this.sigma)return;let t=~~(Math.sqrt(10*2*e**2)+1),r=2*t+1,n=new Float32Array(r*r),s=e*e;for(let i=-t;i<=t;i++)for(let c=-t;c<=t;c++){let l=(t+c)*r+i+t,m=i*i+c*c;n[l]=Math.E**(-m/(2*s))}this.lookupTable=n,this.sigma=e,this.radius=t}resize(e){this.size!==e&&(this.size=e,this.score=new Float32Array(e*e),this.binaryPattern=new Uint8Array(e*e))}invert(){let{binaryPattern:e,score:t,size:r}=this;t.fill(0);for(let n=0,s=e.length;n<s;n++)if(e[n]===0){let i=~~(n/r),c=n-i*r;this.updateScore(c,i,1),e[n]=1}else e[n]=0}updateScore(e,t,r){let{size:n,score:s,lookupTable:i}=this,c=this.radius,l=2*c+1;for(let m=-c;m<=c;m++)for(let f=-c;f<=c;f++){let u=(c+f)*l+m+c,a=i[u],h=e+m;h=h<0?n+h:h%n;let g=t+f;g=g<0?n+g:g%n;let y=g*n+h;s[y]+=r*a}}addPointIndex(e){this.binaryPattern[e]=1;let t=this.size,r=~~(e/t),n=e-r*t;this.updateScore(n,r,1),this.count++}removePointIndex(e){this.binaryPattern[e]=0;let t=this.size,r=~~(e/t),n=e-r*t;this.updateScore(n,r,-1),this.count--}copy(e){this.resize(e.size),this.score.set(e.score),this.binaryPattern.set(e.binaryPattern),this.setSigma(e.sigma),this.count=e.count}};var Sr=class{constructor(){this.random=Math.random,this.sigma=1.5,this.size=64,this.majorityPointsRatio=.1,this.samples=new xt(1),this.savedSamples=new xt(1)}generate(){let{samples:e,savedSamples:t,sigma:r,majorityPointsRatio:n,size:s}=this;e.resize(s),e.setSigma(r);let i=Math.floor(s*s*n),c=e.binaryPattern;gn(c,i),pn(c,this.random);for(let u=0,a=c.length;u<a;u++)c[u]===1&&e.addPointIndex(u);for(;;){let u=e.findCluster();e.removePointIndex(u);let a=e.findVoid();if(u===a){e.addPointIndex(u);break}e.addPointIndex(a)}let l=new Uint32Array(s*s);t.copy(e);let m;for(m=e.count-1;m>=0;){let u=e.findCluster();e.removePointIndex(u),l[u]=m,m--}let f=s*s;for(m=t.count;m<f/2;){let u=t.findVoid();t.addPointIndex(u),l[u]=m,m++}for(t.invert();m<f;){let u=t.findCluster();t.removePointIndex(u),l[u]=m,m++}return{data:l,maxValue:f}}};function $c(o){return o>=3?4:o}function Xc(o){switch(o){case 1:return Yc;case 2:return qc;default:return xn}}var _r=class extends Wc{constructor(e=64,t=1){super(new Float32Array(4),1,1,xn,Gc),this.minFilter=vn,this.magFilter=vn,this.size=e,this.channels=t,this.update()}update(){let e=this.channels,t=this.size,r=new Sr;r.channels=e,r.size=t;let n=$c(e),s=Xc(n);(this.image.width!==t||s!==this.format)&&(this.image.width=t,this.image.height=t,this.image.data=new Float32Array(t**2*n),this.format=s,this.dispose());let i=this.image.data;for(let c=0,l=e;c<l;c++){let m=r.generate(),f=m.data,u=m.maxValue;for(let a=0,h=f.length;a<h;a++){let g=f[a]/u;i[a*n+c]=g}}this.needsUpdate=!0}};var yn=`

	struct PhysicalCamera {

		float focusDistance;
		float anamorphicRatio;
		float bokehSize;
		int apertureBlades;
		float apertureRotation;

	};

`;var bn=`

	struct EquirectHdrInfo {

		sampler2D marginalWeights;
		sampler2D conditionalWeights;
		sampler2D map;

		float totalSum;

	};

`;var Tn=`

	#define RECT_AREA_LIGHT_TYPE 0
	#define CIRC_AREA_LIGHT_TYPE 1
	#define SPOT_LIGHT_TYPE 2
	#define DIR_LIGHT_TYPE 3
	#define POINT_LIGHT_TYPE 4

	struct LightsInfo {

		sampler2D tex;
		uint count;

	};

	struct Light {

		vec3 position;
		int type;

		vec3 color;
		float intensity;

		vec3 u;
		vec3 v;
		float area;

		// spot light fields
		float radius;
		float near;
		float decay;
		float distance;
		float coneCos;
		float penumbraCos;
		int iesProfile;

	};

	Light readLightInfo( sampler2D tex, uint index ) {

		uint i = index * 6u;

		vec4 s0 = texelFetch1D( tex, i + 0u );
		vec4 s1 = texelFetch1D( tex, i + 1u );
		vec4 s2 = texelFetch1D( tex, i + 2u );
		vec4 s3 = texelFetch1D( tex, i + 3u );

		Light l;
		l.position = s0.rgb;
		l.type = int( round( s0.a ) );

		l.color = s1.rgb;
		l.intensity = s1.a;

		l.u = s2.rgb;
		l.v = s3.rgb;
		l.area = s3.a;

		if ( l.type == SPOT_LIGHT_TYPE || l.type == POINT_LIGHT_TYPE ) {

			vec4 s4 = texelFetch1D( tex, i + 4u );
			vec4 s5 = texelFetch1D( tex, i + 5u );
			l.radius = s4.r;
			l.decay = s4.g;
			l.distance = s4.b;
			l.coneCos = s4.a;

			l.penumbraCos = s5.r;
			l.iesProfile = int( round( s5.g ) );

		} else {

			l.radius = 0.0;
			l.decay = 0.0;
			l.distance = 0.0;

			l.coneCos = 0.0;
			l.penumbraCos = 0.0;
			l.iesProfile = - 1;

		}

		return l;

	}

`;var wn=`

	struct Material {

		vec3 color;
		int map;

		float metalness;
		int metalnessMap;

		float roughness;
		int roughnessMap;

		float ior;
		float transmission;
		int transmissionMap;

		float emissiveIntensity;
		vec3 emissive;
		int emissiveMap;

		int normalMap;
		vec2 normalScale;

		float clearcoat;
		int clearcoatMap;
		int clearcoatNormalMap;
		vec2 clearcoatNormalScale;
		float clearcoatRoughness;
		int clearcoatRoughnessMap;

		int iridescenceMap;
		int iridescenceThicknessMap;
		float iridescence;
		float iridescenceIor;
		float iridescenceThicknessMinimum;
		float iridescenceThicknessMaximum;

		vec3 specularColor;
		int specularColorMap;

		float specularIntensity;
		int specularIntensityMap;
		bool thinFilm;

		vec3 attenuationColor;
		float attenuationDistance;

		int alphaMap;

		bool castShadow;
		float opacity;
		float alphaTest;

		float side;
		bool matte;

		float sheen;
		vec3 sheenColor;
		int sheenColorMap;
		float sheenRoughness;
		int sheenRoughnessMap;

		bool vertexColors;
		bool flatShading;
		bool transparent;
		bool fogVolume;

		mat3 mapTransform;
		mat3 metalnessMapTransform;
		mat3 roughnessMapTransform;
		mat3 transmissionMapTransform;
		mat3 emissiveMapTransform;
		mat3 normalMapTransform;
		mat3 clearcoatMapTransform;
		mat3 clearcoatNormalMapTransform;
		mat3 clearcoatRoughnessMapTransform;
		mat3 sheenColorMapTransform;
		mat3 sheenRoughnessMapTransform;
		mat3 iridescenceMapTransform;
		mat3 iridescenceThicknessMapTransform;
		mat3 specularColorMapTransform;
		mat3 specularIntensityMapTransform;
		mat3 alphaMapTransform;

	};

	mat3 readTextureTransform( sampler2D tex, uint index ) {

		mat3 textureTransform;

		vec4 row1 = texelFetch1D( tex, index );
		vec4 row2 = texelFetch1D( tex, index + 1u );

		textureTransform[0] = vec3(row1.r, row2.r, 0.0);
		textureTransform[1] = vec3(row1.g, row2.g, 0.0);
		textureTransform[2] = vec3(row1.b, row2.b, 1.0);

		return textureTransform;

	}

	Material readMaterialInfo( sampler2D tex, uint index ) {

		uint i = index * uint( MATERIAL_PIXELS );

		vec4 s0 = texelFetch1D( tex, i + 0u );
		vec4 s1 = texelFetch1D( tex, i + 1u );
		vec4 s2 = texelFetch1D( tex, i + 2u );
		vec4 s3 = texelFetch1D( tex, i + 3u );
		vec4 s4 = texelFetch1D( tex, i + 4u );
		vec4 s5 = texelFetch1D( tex, i + 5u );
		vec4 s6 = texelFetch1D( tex, i + 6u );
		vec4 s7 = texelFetch1D( tex, i + 7u );
		vec4 s8 = texelFetch1D( tex, i + 8u );
		vec4 s9 = texelFetch1D( tex, i + 9u );
		vec4 s10 = texelFetch1D( tex, i + 10u );
		vec4 s11 = texelFetch1D( tex, i + 11u );
		vec4 s12 = texelFetch1D( tex, i + 12u );
		vec4 s13 = texelFetch1D( tex, i + 13u );
		vec4 s14 = texelFetch1D( tex, i + 14u );

		Material m;
		m.color = s0.rgb;
		m.map = int( round( s0.a ) );

		m.metalness = s1.r;
		m.metalnessMap = int( round( s1.g ) );
		m.roughness = s1.b;
		m.roughnessMap = int( round( s1.a ) );

		m.ior = s2.r;
		m.transmission = s2.g;
		m.transmissionMap = int( round( s2.b ) );
		m.emissiveIntensity = s2.a;

		m.emissive = s3.rgb;
		m.emissiveMap = int( round( s3.a ) );

		m.normalMap = int( round( s4.r ) );
		m.normalScale = s4.gb;

		m.clearcoat = s4.a;
		m.clearcoatMap = int( round( s5.r ) );
		m.clearcoatRoughness = s5.g;
		m.clearcoatRoughnessMap = int( round( s5.b ) );
		m.clearcoatNormalMap = int( round( s5.a ) );
		m.clearcoatNormalScale = s6.rg;

		m.sheen = s6.a;
		m.sheenColor = s7.rgb;
		m.sheenColorMap = int( round( s7.a ) );
		m.sheenRoughness = s8.r;
		m.sheenRoughnessMap = int( round( s8.g ) );

		m.iridescenceMap = int( round( s8.b ) );
		m.iridescenceThicknessMap = int( round( s8.a ) );
		m.iridescence = s9.r;
		m.iridescenceIor = s9.g;
		m.iridescenceThicknessMinimum = s9.b;
		m.iridescenceThicknessMaximum = s9.a;

		m.specularColor = s10.rgb;
		m.specularColorMap = int( round( s10.a ) );

		m.specularIntensity = s11.r;
		m.specularIntensityMap = int( round( s11.g ) );
		m.thinFilm = bool( s11.b );

		m.attenuationColor = s12.rgb;
		m.attenuationDistance = s12.a;

		m.alphaMap = int( round( s13.r ) );

		m.opacity = s13.g;
		m.alphaTest = s13.b;
		m.side = s13.a;

		m.matte = bool( s14.r );
		m.castShadow = bool( s14.g );
		m.vertexColors = bool( int( s14.b ) & 1 );
		m.flatShading = bool( int( s14.b ) & 2 );
		m.fogVolume = bool( int( s14.b ) & 4 );
		m.transparent = bool( s14.a );

		uint firstTextureTransformIdx = i + 15u;

		// mat3( 1.0 ) is an identity matrix
		m.mapTransform = m.map == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx );
		m.metalnessMapTransform = m.metalnessMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 2u );
		m.roughnessMapTransform = m.roughnessMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 4u );
		m.transmissionMapTransform = m.transmissionMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 6u );
		m.emissiveMapTransform = m.emissiveMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 8u );
		m.normalMapTransform = m.normalMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 10u );
		m.clearcoatMapTransform = m.clearcoatMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 12u );
		m.clearcoatNormalMapTransform = m.clearcoatNormalMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 14u );
		m.clearcoatRoughnessMapTransform = m.clearcoatRoughnessMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 16u );
		m.sheenColorMapTransform = m.sheenColorMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 18u );
		m.sheenRoughnessMapTransform = m.sheenRoughnessMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 20u );
		m.iridescenceMapTransform = m.iridescenceMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 22u );
		m.iridescenceThicknessMapTransform = m.iridescenceThicknessMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 24u );
		m.specularColorMapTransform = m.specularColorMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 26u );
		m.specularIntensityMapTransform = m.specularIntensityMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 28u );
		m.alphaMapTransform = m.alphaMap == - 1 ? mat3( 1.0 ) : readTextureTransform( tex, firstTextureTransformIdx + 30u );

		return m;

	}

`;var Sn=`

	struct SurfaceRecord {

		// surface type
		bool volumeParticle;

		// geometry
		vec3 faceNormal;
		bool frontFace;
		vec3 normal;
		mat3 normalBasis;
		mat3 normalInvBasis;

		// cached properties
		float eta;
		float f0;

		// material
		float roughness;
		float filteredRoughness;
		float metalness;
		vec3 color;
		vec3 emission;

		// transmission
		float ior;
		float transmission;
		bool thinFilm;
		vec3 attenuationColor;
		float attenuationDistance;

		// clearcoat
		vec3 clearcoatNormal;
		mat3 clearcoatBasis;
		mat3 clearcoatInvBasis;
		float clearcoat;
		float clearcoatRoughness;
		float filteredClearcoatRoughness;

		// sheen
		float sheen;
		vec3 sheenColor;
		float sheenRoughness;

		// iridescence
		float iridescence;
		float iridescenceIor;
		float iridescenceThickness;

		// specular
		vec3 specularColor;
		float specularIntensity;
	};

	struct ScatterRecord {
		float specularPdf;
		float pdf;
		vec3 direction;
		vec3 color;
	};

`;var _n=`

	// samples the the given environment map in the given direction
	vec3 sampleEquirectColor( sampler2D envMap, vec3 direction ) {

		return texture2D( envMap, equirectDirectionToUv( direction ) ).rgb;

	}

	// gets the pdf of the given direction to sample
	float equirectDirectionPdf( vec3 direction ) {

		vec2 uv = equirectDirectionToUv( direction );
		float theta = uv.y * PI;
		float sinTheta = sin( theta );
		if ( sinTheta == 0.0 ) {

			return 0.0;

		}

		return 1.0 / ( 2.0 * PI * PI * sinTheta );

	}

	// samples the color given env map with CDF and returns the pdf of the direction
	float sampleEquirect( vec3 direction, inout vec3 color ) {

		float totalSum = envMapInfo.totalSum;
		if ( totalSum == 0.0 ) {

			color = vec3( 0.0 );
			return 1.0;

		}

		vec2 uv = equirectDirectionToUv( direction );
		color = texture2D( envMapInfo.map, uv ).rgb;

		float lum = luminance( color );
		ivec2 resolution = textureSize( envMapInfo.map, 0 );
		float pdf = lum / totalSum;

		return float( resolution.x * resolution.y ) * pdf * equirectDirectionPdf( direction );

	}

	// samples a direction of the envmap with color and retrieves pdf
	float sampleEquirectProbability( vec2 r, inout vec3 color, inout vec3 direction ) {

		// sample env map cdf
		float v = texture2D( envMapInfo.marginalWeights, vec2( r.x, 0.0 ) ).x;
		float u = texture2D( envMapInfo.conditionalWeights, vec2( r.y, v ) ).x;
		vec2 uv = vec2( u, v );

		vec3 derivedDirection = equirectUvToDirection( uv );
		direction = derivedDirection;
		color = texture2D( envMapInfo.map, uv ).rgb;

		float totalSum = envMapInfo.totalSum;
		float lum = luminance( color );
		ivec2 resolution = textureSize( envMapInfo.map, 0 );
		float pdf = lum / totalSum;

		return float( resolution.x * resolution.y ) * pdf * equirectDirectionPdf( direction );

	}
`;var In=`

	float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {

		return smoothstep( coneCosine, penumbraCosine, angleCosine );

	}

	float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

		// based upon Frostbite 3 Moving to Physically-based Rendering
		// page 32, equation 26: E[window1]
		// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), EPSILON );

		if ( cutoffDistance > 0.0 ) {

			distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );

		}

		return distanceFalloff;

	}

	float getPhotometricAttenuation( sampler2DArray iesProfiles, int iesProfile, vec3 posToLight, vec3 lightDir, vec3 u, vec3 v ) {

		float cosTheta = dot( posToLight, lightDir );
		float angle = acos( cosTheta ) / PI;

		return texture2D( iesProfiles, vec3( angle, 0.0, iesProfile ) ).r;

	}

	struct LightRecord {

		float dist;
		vec3 direction;
		float pdf;
		vec3 emission;
		int type;

	};

	bool intersectLightAtIndex( sampler2D lights, vec3 rayOrigin, vec3 rayDirection, uint l, inout LightRecord lightRec ) {

		bool didHit = false;
		Light light = readLightInfo( lights, l );

		vec3 u = light.u;
		vec3 v = light.v;

		// check for backface
		vec3 normal = normalize( cross( u, v ) );
		if ( dot( normal, rayDirection ) > 0.0 ) {

			u *= 1.0 / dot( u, u );
			v *= 1.0 / dot( v, v );

			float dist;

			// MIS / light intersection is not supported for punctual lights.
			if(
				( light.type == RECT_AREA_LIGHT_TYPE && intersectsRectangle( light.position, normal, u, v, rayOrigin, rayDirection, dist ) ) ||
				( light.type == CIRC_AREA_LIGHT_TYPE && intersectsCircle( light.position, normal, u, v, rayOrigin, rayDirection, dist ) )
			) {

				float cosTheta = dot( rayDirection, normal );
				didHit = true;
				lightRec.dist = dist;
				lightRec.pdf = ( dist * dist ) / ( light.area * cosTheta );
				lightRec.emission = light.color * light.intensity;
				lightRec.direction = rayDirection;
				lightRec.type = light.type;

			}

		}

		return didHit;

	}

	LightRecord randomAreaLightSample( Light light, vec3 rayOrigin, vec2 ruv ) {

		vec3 randomPos;
		if( light.type == RECT_AREA_LIGHT_TYPE ) {

			// rectangular area light
			randomPos = light.position + light.u * ( ruv.x - 0.5 ) + light.v * ( ruv.y - 0.5 );

		} else if( light.type == CIRC_AREA_LIGHT_TYPE ) {

			// circular area light
			float r = 0.5 * sqrt( ruv.x );
			float theta = ruv.y * 2.0 * PI;
			float x = r * cos( theta );
			float y = r * sin( theta );

			randomPos = light.position + light.u * x + light.v * y;

		}

		vec3 toLight = randomPos - rayOrigin;
		float lightDistSq = dot( toLight, toLight );
		float dist = sqrt( lightDistSq );
		vec3 direction = toLight / dist;
		vec3 lightNormal = normalize( cross( light.u, light.v ) );

		LightRecord lightRec;
		lightRec.type = light.type;
		lightRec.emission = light.color * light.intensity;
		lightRec.dist = dist;
		lightRec.direction = direction;

		// TODO: the denominator is potentially zero
		lightRec.pdf = lightDistSq / ( light.area * dot( direction, lightNormal ) );

		return lightRec;

	}

	LightRecord randomSpotLightSample( Light light, sampler2DArray iesProfiles, vec3 rayOrigin, vec2 ruv ) {

		float radius = light.radius * sqrt( ruv.x );
		float theta = ruv.y * 2.0 * PI;
		float x = radius * cos( theta );
		float y = radius * sin( theta );

		vec3 u = light.u;
		vec3 v = light.v;
		vec3 normal = normalize( cross( u, v ) );

		float angle = acos( light.coneCos );
		float angleTan = tan( angle );
		float startDistance = light.radius / max( angleTan, EPSILON );

		vec3 randomPos = light.position - normal * startDistance + u * x + v * y;
		vec3 toLight = randomPos - rayOrigin;
		float lightDistSq = dot( toLight, toLight );
		float dist = sqrt( lightDistSq );

		vec3 direction = toLight / max( dist, EPSILON );
		float cosTheta = dot( direction, normal );

		float spotAttenuation = light.iesProfile != - 1 ?
			getPhotometricAttenuation( iesProfiles, light.iesProfile, direction, normal, u, v ) :
			getSpotAttenuation( light.coneCos, light.penumbraCos, cosTheta );

		float distanceAttenuation = getDistanceAttenuation( dist, light.distance, light.decay );
		LightRecord lightRec;
		lightRec.type = light.type;
		lightRec.dist = dist;
		lightRec.direction = direction;
		lightRec.emission = light.color * light.intensity * distanceAttenuation * spotAttenuation;
		lightRec.pdf = 1.0;

		return lightRec;

	}

	LightRecord randomLightSample( sampler2D lights, sampler2DArray iesProfiles, uint lightCount, vec3 rayOrigin, vec3 ruv ) {

		LightRecord result;

		// pick a random light
		uint l = uint( ruv.x * float( lightCount ) );
		Light light = readLightInfo( lights, l );

		if ( light.type == SPOT_LIGHT_TYPE ) {

			result = randomSpotLightSample( light, iesProfiles, rayOrigin, ruv.yz );

		} else if ( light.type == POINT_LIGHT_TYPE ) {

			vec3 lightRay = light.u - rayOrigin;
			float lightDist = length( lightRay );
			float cutoffDistance = light.distance;
			float distanceFalloff = 1.0 / max( pow( lightDist, light.decay ), 0.01 );
			if ( cutoffDistance > 0.0 ) {

				distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDist / cutoffDistance ) ) );

			}

			LightRecord rec;
			rec.direction = normalize( lightRay );
			rec.dist = length( lightRay );
			rec.pdf = 1.0;
			rec.emission = light.color * light.intensity * distanceFalloff;
			rec.type = light.type;
			result = rec;

		} else if ( light.type == DIR_LIGHT_TYPE ) {

			LightRecord rec;
			rec.dist = 1e10;
			rec.direction = light.u;
			rec.pdf = 1.0;
			rec.emission = light.color * light.intensity;
			rec.type = light.type;

			result = rec;

		} else {

			// sample the light
			result = randomAreaLightSample( light, rayOrigin, ruv.yz );

		}

		return result;

	}

`;var An=`

	vec3 sampleHemisphere( vec3 n, vec2 uv ) {

		// https://www.rorydriscoll.com/2009/01/07/better-sampling/
		// https://graphics.pixar.com/library/OrthonormalB/paper.pdf
		float sign = n.z == 0.0 ? 1.0 : sign( n.z );
		float a = - 1.0 / ( sign + n.z );
		float b = n.x * n.y * a;
		vec3 b1 = vec3( 1.0 + sign * n.x * n.x * a, sign * b, - sign * n.x );
		vec3 b2 = vec3( b, sign + n.y * n.y * a, - n.y );

		float r = sqrt( uv.x );
		float theta = 2.0 * PI * uv.y;
		float x = r * cos( theta );
		float y = r * sin( theta );
		return x * b1 + y * b2 + sqrt( 1.0 - uv.x ) * n;

	}

	vec2 sampleTriangle( vec2 a, vec2 b, vec2 c, vec2 r ) {

		// get the edges of the triangle and the diagonal across the
		// center of the parallelogram
		vec2 e1 = a - b;
		vec2 e2 = c - b;
		vec2 diag = normalize( e1 + e2 );

		// pick the point in the parallelogram
		if ( r.x + r.y > 1.0 ) {

			r = vec2( 1.0 ) - r;

		}

		return e1 * r.x + e2 * r.y;

	}

	vec2 sampleCircle( vec2 uv ) {

		float angle = 2.0 * PI * uv.x;
		float radius = sqrt( uv.y );
		return vec2( cos( angle ), sin( angle ) ) * radius;

	}

	vec3 sampleSphere( vec2 uv ) {

		float u = ( uv.x - 0.5 ) * 2.0;
		float t = uv.y * PI * 2.0;
		float f = sqrt( 1.0 - u * u );

		return vec3( f * cos( t ), f * sin( t ), u );

	}

	vec2 sampleRegularPolygon( int sides, vec3 uvw ) {

		sides = max( sides, 3 );

		vec3 r = uvw;
		float anglePerSegment = 2.0 * PI / float( sides );
		float segment = floor( float( sides ) * r.x );

		float angle1 = anglePerSegment * segment;
		float angle2 = angle1 + anglePerSegment;
		vec2 a = vec2( sin( angle1 ), cos( angle1 ) );
		vec2 b = vec2( 0.0, 0.0 );
		vec2 c = vec2( sin( angle2 ), cos( angle2 ) );

		return sampleTriangle( a, b, c, r.yz );

	}

	// samples an aperture shape with the given number of sides. 0 means circle
	vec2 sampleAperture( int blades, vec3 uvw ) {

		return blades == 0 ?
			sampleCircle( uvw.xy ) :
			sampleRegularPolygon( blades, uvw );

	}


`;var Rn=`

	bool totalInternalReflection( float cosTheta, float eta ) {

		float sinTheta = sqrt( 1.0 - cosTheta * cosTheta );
		return eta * sinTheta > 1.0;

	}

	// https://google.github.io/filament/Filament.md.html#materialsystem/diffusebrdf
	float schlickFresnel( float cosine, float f0 ) {

		return f0 + ( 1.0 - f0 ) * pow( 1.0 - cosine, 5.0 );

	}

	vec3 schlickFresnel( float cosine, vec3 f0 ) {

		return f0 + ( 1.0 - f0 ) * pow( 1.0 - cosine, 5.0 );

	}

	vec3 schlickFresnel( float cosine, vec3 f0, vec3 f90 ) {

		return f0 + ( f90 - f0 ) * pow( 1.0 - cosine, 5.0 );

	}

	float dielectricFresnel( float cosThetaI, float eta ) {

		// https://schuttejoe.github.io/post/disneybsdf/
		float ni = eta;
		float nt = 1.0;

		// Check for total internal reflection
		float sinThetaISq = 1.0f - cosThetaI * cosThetaI;
		float sinThetaTSq = eta * eta * sinThetaISq;
		if( sinThetaTSq >= 1.0 ) {

			return 1.0;

		}

		float sinThetaT = sqrt( sinThetaTSq );

		float cosThetaT = sqrt( max( 0.0, 1.0f - sinThetaT * sinThetaT ) );
		float rParallel = ( ( nt * cosThetaI ) - ( ni * cosThetaT ) ) / ( ( nt * cosThetaI ) + ( ni * cosThetaT ) );
		float rPerpendicular = ( ( ni * cosThetaI ) - ( nt * cosThetaT ) ) / ( ( ni * cosThetaI ) + ( nt * cosThetaT ) );
		return ( rParallel * rParallel + rPerpendicular * rPerpendicular ) / 2.0;

	}

	// https://raytracing.github.io/books/RayTracingInOneWeekend.html#dielectrics/schlickapproximation
	float iorRatioToF0( float eta ) {

		return pow( ( 1.0 - eta ) / ( 1.0 + eta ), 2.0 );

	}

	vec3 evaluateFresnel( float cosTheta, float eta, vec3 f0, vec3 f90 ) {

		if ( totalInternalReflection( cosTheta, eta ) ) {

			return f90;

		}

		return schlickFresnel( cosTheta, f0, f90 );

	}

	// TODO: disney fresnel was removed and replaced with this fresnel function to better align with
	// the glTF but is causing blown out pixels. Should be revisited
	// float evaluateFresnelWeight( float cosTheta, float eta, float f0 ) {

	// 	if ( totalInternalReflection( cosTheta, eta ) ) {

	// 		return 1.0;

	// 	}

	// 	return schlickFresnel( cosTheta, f0 );

	// }

	// https://schuttejoe.github.io/post/disneybsdf/
	float disneyFresnel( vec3 wo, vec3 wi, vec3 wh, float f0, float eta, float metalness ) {

		float dotHV = dot( wo, wh );
		if ( totalInternalReflection( dotHV, eta ) ) {

			return 1.0;

		}

		float dotHL = dot( wi, wh );
		float dielectricFresnel = dielectricFresnel( abs( dotHV ), eta );
		float metallicFresnel = schlickFresnel( dotHL, f0 );

		return mix( dielectricFresnel, metallicFresnel, metalness );

	}

`;var Pn=`

	// Fast arccos approximation used to remove banding artifacts caused by numerical errors in acos.
	// This is a cubic Lagrange interpolating polynomial for x = [-1, -1/2, 0, 1/2, 1].
	// For more information see: https://github.com/gkjohnson/three-gpu-pathtracer/pull/171#issuecomment-1152275248
	float acosApprox( float x ) {

		x = clamp( x, -1.0, 1.0 );
		return ( - 0.69813170079773212 * x * x - 0.87266462599716477 ) * x + 1.5707963267948966;

	}

	// An acos with input values bound to the range [-1, 1].
	float acosSafe( float x ) {

		return acos( clamp( x, -1.0, 1.0 ) );

	}

	float saturateCos( float val ) {

		return clamp( val, 0.001, 1.0 );

	}

	float square( float t ) {

		return t * t;

	}

	vec2 square( vec2 t ) {

		return t * t;

	}

	vec3 square( vec3 t ) {

		return t * t;

	}

	vec4 square( vec4 t ) {

		return t * t;

	}

	vec2 rotateVector( vec2 v, float t ) {

		float ac = cos( t );
		float as = sin( t );
		return vec2(
			v.x * ac - v.y * as,
			v.x * as + v.y * ac
		);

	}

	// forms a basis with the normal vector as Z
	mat3 getBasisFromNormal( vec3 normal ) {

		vec3 other;
		if ( abs( normal.x ) > 0.5 ) {

			other = vec3( 0.0, 1.0, 0.0 );

		} else {

			other = vec3( 1.0, 0.0, 0.0 );

		}

		vec3 ortho = normalize( cross( normal, other ) );
		vec3 ortho2 = normalize( cross( normal, ortho ) );
		return mat3( ortho2, ortho, normal );

	}

`;var Fn=`

	// Finds the point where the ray intersects the plane defined by u and v and checks if this point
	// falls in the bounds of the rectangle on that same plane.
	// Plane intersection: https://lousodrome.net/blog/light/2020/07/03/intersection-of-a-ray-and-a-plane/
	bool intersectsRectangle( vec3 center, vec3 normal, vec3 u, vec3 v, vec3 rayOrigin, vec3 rayDirection, inout float dist ) {

		float t = dot( center - rayOrigin, normal ) / dot( rayDirection, normal );

		if ( t > EPSILON ) {

			vec3 p = rayOrigin + rayDirection * t;
			vec3 vi = p - center;

			// check if p falls inside the rectangle
			float a1 = dot( u, vi );
			if ( abs( a1 ) <= 0.5 ) {

				float a2 = dot( v, vi );
				if ( abs( a2 ) <= 0.5 ) {

					dist = t;
					return true;

				}

			}

		}

		return false;

	}

	// Finds the point where the ray intersects the plane defined by u and v and checks if this point
	// falls in the bounds of the circle on that same plane. See above URL for a description of the plane intersection algorithm.
	bool intersectsCircle( vec3 position, vec3 normal, vec3 u, vec3 v, vec3 rayOrigin, vec3 rayDirection, inout float dist ) {

		float t = dot( position - rayOrigin, normal ) / dot( rayDirection, normal );

		if ( t > EPSILON ) {

			vec3 hit = rayOrigin + rayDirection * t;
			vec3 vi = hit - position;

			float a1 = dot( u, vi );
			float a2 = dot( v, vi );

			if( length( vec2( a1, a2 ) ) <= 0.5 ) {

				dist = t;
				return true;

			}

		}

		return false;

	}

`;var Mn=`

	// add texel fetch functions for texture arrays
	vec4 texelFetch1D( sampler2DArray tex, int layer, uint index ) {

		uint width = uint( textureSize( tex, 0 ).x );
		uvec2 uv;
		uv.x = index % width;
		uv.y = index / width;

		return texelFetch( tex, ivec3( uv, layer ), 0 );

	}

	vec4 textureSampleBarycoord( sampler2DArray tex, int layer, vec3 barycoord, uvec3 faceIndices ) {

		return
			barycoord.x * texelFetch1D( tex, layer, faceIndices.x ) +
			barycoord.y * texelFetch1D( tex, layer, faceIndices.y ) +
			barycoord.z * texelFetch1D( tex, layer, faceIndices.z );

	}

`;var je=`

	// TODO: possibly this should be renamed something related to material or path tracing logic

	#ifndef RAY_OFFSET
	#define RAY_OFFSET 1e-4
	#endif

	// adjust the hit point by the surface normal by a factor of some offset and the
	// maximum component-wise value of the current point to accommodate floating point
	// error as values increase.
	vec3 stepRayOrigin( vec3 rayOrigin, vec3 rayDirection, vec3 offset, float dist ) {

		vec3 point = rayOrigin + rayDirection * dist;
		vec3 absPoint = abs( point );
		float maxPoint = max( absPoint.x, max( absPoint.y, absPoint.z ) );
		return point + offset * ( maxPoint + 1.0 ) * RAY_OFFSET;

	}

	// https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md#attenuation
	vec3 transmissionAttenuation( float dist, vec3 attColor, float attDist ) {

		vec3 ot = - log( attColor ) / attDist;
		return exp( - ot * dist );

	}

	vec3 getHalfVector( vec3 wi, vec3 wo, float eta ) {

		// get the half vector - assuming if the light incident vector is on the other side
		// of the that it's transmissive.
		vec3 h;
		if ( wi.z > 0.0 ) {

			h = normalize( wi + wo );

		} else {

			// Scale by the ior ratio to retrieve the appropriate half vector
			// From Section 2.2 on computing the transmission half vector:
			// https://blog.selfshadow.com/publications/s2015-shading-course/burley/s2015_pbs_disney_bsdf_notes.pdf
			h = normalize( wi + wo * eta );

		}

		h *= sign( h.z );
		return h;

	}

	vec3 getHalfVector( vec3 a, vec3 b ) {

		return normalize( a + b );

	}

	// The discrepancy between interpolated surface normal and geometry normal can cause issues when a ray
	// is cast that is on the top side of the geometry normal plane but below the surface normal plane. If
	// we find a ray like that we ignore it to avoid artifacts.
	// This function returns if the direction is on the same side of both planes.
	bool isDirectionValid( vec3 direction, vec3 surfaceNormal, vec3 geometryNormal ) {

		bool aboveSurfaceNormal = dot( direction, surfaceNormal ) > 0.0;
		bool aboveGeometryNormal = dot( direction, geometryNormal ) > 0.0;
		return aboveSurfaceNormal == aboveGeometryNormal;

	}

	// ray sampling x and z are swapped to align with expected background view
	vec2 equirectDirectionToUv( vec3 direction ) {

		// from Spherical.setFromCartesianCoords
		vec2 uv = vec2( atan( direction.z, direction.x ), acos( direction.y ) );
		uv /= vec2( 2.0 * PI, PI );

		// apply adjustments to get values in range [0, 1] and y right side up
		uv.x += 0.5;
		uv.y = 1.0 - uv.y;
		return uv;

	}

	vec3 equirectUvToDirection( vec2 uv ) {

		// undo above adjustments
		uv.x -= 0.5;
		uv.y = 1.0 - uv.y;

		// from Vector3.setFromSphericalCoords
		float theta = uv.x * 2.0 * PI;
		float phi = uv.y * PI;

		float sinPhi = sin( phi );

		return vec3( sinPhi * cos( theta ), cos( phi ), sinPhi * sin( theta ) );

	}

	// power heuristic for multiple importance sampling
	float misHeuristic( float a, float b ) {

		float aa = a * a;
		float bb = b * b;
		return aa / ( aa + bb );

	}

	// tentFilter from Peter Shirley's 'Realistic Ray Tracing (2nd Edition)' book, pg. 60
	// erichlof/THREE.js-PathTracing-Renderer/
	float tentFilter( float x ) {

		return x < 0.5 ? sqrt( 2.0 * x ) - 1.0 : 1.0 - sqrt( 2.0 - ( 2.0 * x ) );

	}
`;var Ti=`

	// https://www.shadertoy.com/view/wltcRS
	uvec4 WHITE_NOISE_SEED;

	void rng_initialize( vec2 p, int frame ) {

		// white noise seed
		WHITE_NOISE_SEED = uvec4( p, uint( frame ), uint( p.x ) + uint( p.y ) );

	}

	// https://www.pcg-random.org/
	void pcg4d( inout uvec4 v ) {

		v = v * 1664525u + 1013904223u;
		v.x += v.y * v.w;
		v.y += v.z * v.x;
		v.z += v.x * v.y;
		v.w += v.y * v.z;
		v = v ^ ( v >> 16u );
		v.x += v.y*v.w;
		v.y += v.z*v.x;
		v.z += v.x*v.y;
		v.w += v.y*v.z;

	}

	// returns [ 0, 1 ]
	float pcgRand() {

		pcg4d( WHITE_NOISE_SEED );
		return float( WHITE_NOISE_SEED.x ) / float( 0xffffffffu );

	}

	vec2 pcgRand2() {

		pcg4d( WHITE_NOISE_SEED );
		return vec2( WHITE_NOISE_SEED.xy ) / float(0xffffffffu);

	}

	vec3 pcgRand3() {

		pcg4d( WHITE_NOISE_SEED );
		return vec3( WHITE_NOISE_SEED.xyz ) / float( 0xffffffffu );

	}

	vec4 pcgRand4() {

		pcg4d( WHITE_NOISE_SEED );
		return vec4( WHITE_NOISE_SEED ) / float( 0xffffffffu );

	}
`;var Dn=`

	uniform sampler2D stratifiedTexture;
	uniform sampler2D stratifiedOffsetTexture;

	uint sobolPixelIndex = 0u;
	uint sobolPathIndex = 0u;
	uint sobolBounceIndex = 0u;
	vec4 pixelSeed = vec4( 0 );

	vec4 rand4( int v ) {

		ivec2 uv = ivec2( v, sobolBounceIndex );
		vec4 stratifiedSample = texelFetch( stratifiedTexture, uv, 0 );
		return fract( stratifiedSample + pixelSeed.r ); // blue noise + stratified samples

	}

	vec3 rand3( int v ) {

		return rand4( v ).xyz;

	}

	vec2 rand2( int v ) {

		return rand4( v ).xy;

	}

	float rand( int v ) {

		return rand4( v ).x;

	}

	void rng_initialize( vec2 screenCoord, int frame ) {

		// tile the small noise texture across the entire screen
		ivec2 noiseSize = ivec2( textureSize( stratifiedOffsetTexture, 0 ) );
		ivec2 pixel = ivec2( screenCoord.xy ) % noiseSize;
		vec2 pixelWidth = 1.0 / vec2( noiseSize );
		vec2 uv = vec2( pixel ) * pixelWidth + pixelWidth * 0.5;

		// note that using "texelFetch" here seems to break Android for some reason
		pixelSeed = texture( stratifiedOffsetTexture, uv );

	}

`;var Cn=`

	// diffuse
	float diffuseEval( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf, inout vec3 color ) {

		// https://schuttejoe.github.io/post/disneybsdf/
		float fl = schlickFresnel( wi.z, 0.0 );
		float fv = schlickFresnel( wo.z, 0.0 );

		float metalFactor = ( 1.0 - surf.metalness );
		float transFactor = ( 1.0 - surf.transmission );
		float rr = 0.5 + 2.0 * surf.roughness * fl * fl;
		float retro = rr * ( fl + fv + fl * fv * ( rr - 1.0f ) );
		float lambert = ( 1.0f - 0.5f * fl ) * ( 1.0f - 0.5f * fv );

		// TODO: subsurface approx?

		// float F = evaluateFresnelWeight( dot( wo, wh ), surf.eta, surf.f0 );
		float F = disneyFresnel( wo, wi, wh, surf.f0, surf.eta, surf.metalness );
		color = ( 1.0 - F ) * transFactor * metalFactor * wi.z * surf.color * ( retro + lambert ) / PI;

		return wi.z / PI;

	}

	vec3 diffuseDirection( vec3 wo, SurfaceRecord surf ) {

		vec3 lightDirection = sampleSphere( rand2( 11 ) );
		lightDirection.z += 1.0;
		lightDirection = normalize( lightDirection );

		return lightDirection;

	}

	// specular
	float specularEval( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf, inout vec3 color ) {

		// if roughness is set to 0 then D === NaN which results in black pixels
		float metalness = surf.metalness;
		float roughness = surf.filteredRoughness;

		float eta = surf.eta;
		float f0 = surf.f0;

		vec3 f0Color = mix( f0 * surf.specularColor * surf.specularIntensity, surf.color, surf.metalness );
		vec3 f90Color = vec3( mix( surf.specularIntensity, 1.0, surf.metalness ) );
		vec3 F = evaluateFresnel( dot( wo, wh ), eta, f0Color, f90Color );

		vec3 iridescenceF = evalIridescence( 1.0, surf.iridescenceIor, dot( wi, wh ), surf.iridescenceThickness, f0Color );
		F = mix( F, iridescenceF,  surf.iridescence );

		// PDF
		// See 14.1.1 Microfacet BxDFs in https://www.pbr-book.org/
		float incidentTheta = acos( wo.z );
		float G = ggxShadowMaskG2( wi, wo, roughness );
		float D = ggxDistribution( wh, roughness );
		float G1 = ggxShadowMaskG1( incidentTheta, roughness );
		float ggxPdf = D * G1 * max( 0.0, abs( dot( wo, wh ) ) ) / abs ( wo.z );

		color = wi.z * F * G * D / ( 4.0 * abs( wi.z * wo.z ) );
		return ggxPdf / ( 4.0 * dot( wo, wh ) );

	}

	vec3 specularDirection( vec3 wo, SurfaceRecord surf ) {

		// sample ggx vndf distribution which gives a new normal
		float roughness = surf.filteredRoughness;
		vec3 halfVector = ggxDirection(
			wo,
			vec2( roughness ),
			rand2( 12 )
		);

		// apply to new ray by reflecting off the new normal
		return - reflect( wo, halfVector );

	}


	// transmission
	/*
	float transmissionEval( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf, inout vec3 color ) {

		// See section 4.2 in https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf

		float filteredRoughness = surf.filteredRoughness;
		float eta = surf.eta;
		bool frontFace = surf.frontFace;
		bool thinFilm = surf.thinFilm;

		color = surf.transmission * surf.color;

		float denom = pow( eta * dot( wi, wh ) + dot( wo, wh ), 2.0 );
		return ggxPDF( wo, wh, filteredRoughness ) / denom;

	}

	vec3 transmissionDirection( vec3 wo, SurfaceRecord surf ) {

		float filteredRoughness = surf.filteredRoughness;
		float eta = surf.eta;
		bool frontFace = surf.frontFace;

		// sample ggx vndf distribution which gives a new normal
		vec3 halfVector = ggxDirection(
			wo,
			vec2( filteredRoughness ),
			rand2( 13 )
		);

		vec3 lightDirection = refract( normalize( - wo ), halfVector, eta );
		if ( surf.thinFilm ) {

			lightDirection = - refract( normalize( - lightDirection ), - vec3( 0.0, 0.0, 1.0 ), 1.0 / eta );

		}

		return normalize( lightDirection );

	}
	*/

	// TODO: This is just using a basic cosine-weighted specular distribution with an
	// incorrect PDF value at the moment. Update it to correctly use a GGX distribution
	float transmissionEval( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf, inout vec3 color ) {

		color = surf.transmission * surf.color;

		// PDF
		// float F = evaluateFresnelWeight( dot( wo, wh ), surf.eta, surf.f0 );
		// float F = disneyFresnel( wo, wi, wh, surf.f0, surf.eta, surf.metalness );
		// if ( F >= 1.0 ) {

		// 	return 0.0;

		// }

		// return 1.0 / ( 1.0 - F );

		// reverted to previous to transmission. The above was causing black pixels
		float eta = surf.eta;
		float f0 = surf.f0;
		float cosTheta = min( wo.z, 1.0 );
		float sinTheta = sqrt( 1.0 - cosTheta * cosTheta );
		float reflectance = schlickFresnel( cosTheta, f0 );
		bool cannotRefract = eta * sinTheta > 1.0;
		if ( cannotRefract ) {

			return 0.0;

		}

		return 1.0 / ( 1.0 - reflectance );

	}

	vec3 transmissionDirection( vec3 wo, SurfaceRecord surf ) {

		float roughness = surf.filteredRoughness;
		float eta = surf.eta;
		vec3 halfVector = normalize( vec3( 0.0, 0.0, 1.0 ) + sampleSphere( rand2( 13 ) ) * roughness );
		vec3 lightDirection = refract( normalize( - wo ), halfVector, eta );

		if ( surf.thinFilm ) {

			lightDirection = - refract( normalize( - lightDirection ), - vec3( 0.0, 0.0, 1.0 ), 1.0 / eta );

		}
		return normalize( lightDirection );

	}

	// clearcoat
	float clearcoatEval( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf, inout vec3 color ) {

		float ior = 1.5;
		float f0 = iorRatioToF0( ior );
		bool frontFace = surf.frontFace;
		float roughness = surf.filteredClearcoatRoughness;

		float eta = frontFace ? 1.0 / ior : ior;
		float G = ggxShadowMaskG2( wi, wo, roughness );
		float D = ggxDistribution( wh, roughness );
		float F = schlickFresnel( dot( wi, wh ), f0 );

		float fClearcoat = F * D * G / ( 4.0 * abs( wi.z * wo.z ) );
		color = color * ( 1.0 - surf.clearcoat * F ) + fClearcoat * surf.clearcoat * wi.z;

		// PDF
		// See equation (27) in http://jcgt.org/published/0003/02/03/
		return ggxPDF( wo, wh, roughness ) / ( 4.0 * dot( wi, wh ) );

	}

	vec3 clearcoatDirection( vec3 wo, SurfaceRecord surf ) {

		// sample ggx vndf distribution which gives a new normal
		float roughness = surf.filteredClearcoatRoughness;
		vec3 halfVector = ggxDirection(
			wo,
			vec2( roughness ),
			rand2( 14 )
		);

		// apply to new ray by reflecting off the new normal
		return - reflect( wo, halfVector );

	}

	// sheen
	vec3 sheenColor( vec3 wo, vec3 wi, vec3 wh, SurfaceRecord surf ) {

		float cosThetaO = saturateCos( wo.z );
		float cosThetaI = saturateCos( wi.z );
		float cosThetaH = wh.z;

		float D = velvetD( cosThetaH, surf.sheenRoughness );
		float G = velvetG( cosThetaO, cosThetaI, surf.sheenRoughness );

		// See equation (1) in http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
		vec3 color = surf.sheenColor;
		color *= D * G / ( 4.0 * abs( cosThetaO * cosThetaI ) );
		color *= wi.z;

		return color;

	}

	// bsdf
	void getLobeWeights(
		vec3 wo, vec3 wi, vec3 wh, vec3 clearcoatWo, SurfaceRecord surf,
		inout float diffuseWeight, inout float specularWeight, inout float transmissionWeight, inout float clearcoatWeight
	) {

		float metalness = surf.metalness;
		float transmission = surf.transmission;
		// float fEstimate = evaluateFresnelWeight( dot( wo, wh ), surf.eta, surf.f0 );
		float fEstimate = disneyFresnel( wo, wi, wh, surf.f0, surf.eta, surf.metalness );

		float transSpecularProb = mix( max( 0.25, fEstimate ), 1.0, metalness );
		float diffSpecularProb = 0.5 + 0.5 * metalness;

		diffuseWeight = ( 1.0 - transmission ) * ( 1.0 - diffSpecularProb );
		specularWeight = transmission * transSpecularProb + ( 1.0 - transmission ) * diffSpecularProb;
		transmissionWeight = transmission * ( 1.0 - transSpecularProb );
		clearcoatWeight = surf.clearcoat * schlickFresnel( clearcoatWo.z, 0.04 );

		float totalWeight = diffuseWeight + specularWeight + transmissionWeight + clearcoatWeight;
		diffuseWeight /= totalWeight;
		specularWeight /= totalWeight;
		transmissionWeight /= totalWeight;
		clearcoatWeight /= totalWeight;
	}

	float bsdfEval(
		vec3 wo, vec3 clearcoatWo, vec3 wi, vec3 clearcoatWi, SurfaceRecord surf,
		float diffuseWeight, float specularWeight, float transmissionWeight, float clearcoatWeight, inout float specularPdf, inout vec3 color
	) {

		float metalness = surf.metalness;
		float transmission = surf.transmission;

		float spdf = 0.0;
		float dpdf = 0.0;
		float tpdf = 0.0;
		float cpdf = 0.0;
		color = vec3( 0.0 );

		vec3 halfVector = getHalfVector( wi, wo, surf.eta );

		// diffuse
		if ( diffuseWeight > 0.0 && wi.z > 0.0 ) {

			dpdf = diffuseEval( wo, wi, halfVector, surf, color );
			color *= 1.0 - surf.transmission;

		}

		// ggx specular
		if ( specularWeight > 0.0 && wi.z > 0.0 ) {

			vec3 outColor;
			spdf = specularEval( wo, wi, getHalfVector( wi, wo ), surf, outColor );
			color += outColor;

		}

		// transmission
		if ( transmissionWeight > 0.0 && wi.z < 0.0 ) {

			tpdf = transmissionEval( wo, wi, halfVector, surf, color );

		}

		// sheen
		color *= mix( 1.0, sheenAlbedoScaling( wo, wi, surf ), surf.sheen );
		color += sheenColor( wo, wi, halfVector, surf ) * surf.sheen;

		// clearcoat
		if ( clearcoatWi.z >= 0.0 && clearcoatWeight > 0.0 ) {

			vec3 clearcoatHalfVector = getHalfVector( clearcoatWo, clearcoatWi );
			cpdf = clearcoatEval( clearcoatWo, clearcoatWi, clearcoatHalfVector, surf, color );

		}

		float pdf =
			dpdf * diffuseWeight
			+ spdf * specularWeight
			+ tpdf * transmissionWeight
			+ cpdf * clearcoatWeight;

		// retrieve specular rays for the shadows flag
		specularPdf = spdf * specularWeight + cpdf * clearcoatWeight;

		return pdf;

	}

	float bsdfResult( vec3 worldWo, vec3 worldWi, SurfaceRecord surf, inout vec3 color ) {

		if ( surf.volumeParticle ) {

			color = surf.color / ( 4.0 * PI );
			return 1.0 / ( 4.0 * PI );

		}

		vec3 wo = normalize( surf.normalInvBasis * worldWo );
		vec3 wi = normalize( surf.normalInvBasis * worldWi );

		vec3 clearcoatWo = normalize( surf.clearcoatInvBasis * worldWo );
		vec3 clearcoatWi = normalize( surf.clearcoatInvBasis * worldWi );

		vec3 wh = getHalfVector( wo, wi, surf.eta );
		float diffuseWeight;
		float specularWeight;
		float transmissionWeight;
		float clearcoatWeight;
		getLobeWeights( wo, wi, wh, clearcoatWo, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight );

		float specularPdf;
		return bsdfEval( wo, clearcoatWo, wi, clearcoatWi, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight, specularPdf, color );

	}

	ScatterRecord bsdfSample( vec3 worldWo, SurfaceRecord surf ) {

		if ( surf.volumeParticle ) {

			ScatterRecord sampleRec;
			sampleRec.specularPdf = 0.0;
			sampleRec.pdf = 1.0 / ( 4.0 * PI );
			sampleRec.direction = sampleSphere( rand2( 16 ) );
			sampleRec.color = surf.color / ( 4.0 * PI );
			return sampleRec;

		}

		vec3 wo = normalize( surf.normalInvBasis * worldWo );
		vec3 clearcoatWo = normalize( surf.clearcoatInvBasis * worldWo );
		mat3 normalBasis = surf.normalBasis;
		mat3 invBasis = surf.normalInvBasis;
		mat3 clearcoatNormalBasis = surf.clearcoatBasis;
		mat3 clearcoatInvBasis = surf.clearcoatInvBasis;

		float diffuseWeight;
		float specularWeight;
		float transmissionWeight;
		float clearcoatWeight;
		// using normal and basically-reflected ray since we don't have proper half vector here
		getLobeWeights( wo, wo, vec3( 0, 0, 1 ), clearcoatWo, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight );

		float pdf[4];
		pdf[0] = diffuseWeight;
		pdf[1] = specularWeight;
		pdf[2] = transmissionWeight;
		pdf[3] = clearcoatWeight;

		float cdf[4];
		cdf[0] = pdf[0];
		cdf[1] = pdf[1] + cdf[0];
		cdf[2] = pdf[2] + cdf[1];
		cdf[3] = pdf[3] + cdf[2];

		if( cdf[3] != 0.0 ) {

			float invMaxCdf = 1.0 / cdf[3];
			cdf[0] *= invMaxCdf;
			cdf[1] *= invMaxCdf;
			cdf[2] *= invMaxCdf;
			cdf[3] *= invMaxCdf;

		} else {

			cdf[0] = 1.0;
			cdf[1] = 0.0;
			cdf[2] = 0.0;
			cdf[3] = 0.0;

		}

		vec3 wi;
		vec3 clearcoatWi;

		float r = rand( 15 );
		if ( r <= cdf[0] ) { // diffuse

			wi = diffuseDirection( wo, surf );
			clearcoatWi = normalize( clearcoatInvBasis * normalize( normalBasis * wi ) );

		} else if ( r <= cdf[1] ) { // specular

			wi = specularDirection( wo, surf );
			clearcoatWi = normalize( clearcoatInvBasis * normalize( normalBasis * wi ) );

		} else if ( r <= cdf[2] ) { // transmission / refraction

			wi = transmissionDirection( wo, surf );
			clearcoatWi = normalize( clearcoatInvBasis * normalize( normalBasis * wi ) );

		} else if ( r <= cdf[3] ) { // clearcoat

			clearcoatWi = clearcoatDirection( clearcoatWo, surf );
			wi = normalize( invBasis * normalize( clearcoatNormalBasis * clearcoatWi ) );

		}

		ScatterRecord result;
		result.pdf = bsdfEval( wo, clearcoatWo, wi, clearcoatWi, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight, result.specularPdf, result.color );
		result.direction = normalize( surf.normalBasis * wi );

		return result;

	}

`;var En=`

	// returns the hit distance given the material density
	float intersectFogVolume( Material material, float u ) {

		// https://raytracing.github.io/books/RayTracingTheNextWeek.html#volumes/constantdensitymediums
		return material.opacity == 0.0 ? INFINITY : ( - 1.0 / material.opacity ) * log( u );

	}

	ScatterRecord sampleFogVolume( SurfaceRecord surf, vec2 uv ) {

		ScatterRecord sampleRec;
		sampleRec.specularPdf = 0.0;
		sampleRec.pdf = 1.0 / ( 2.0 * PI );
		sampleRec.direction = sampleSphere( uv );
		sampleRec.color = surf.color;
		return sampleRec;

	}

`;var Bn=`

	// The GGX functions provide sampling and distribution information for normals as output so
	// in order to get probability of scatter direction the half vector must be computed and provided.
	// [0] https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
	// [1] https://hal.archives-ouvertes.fr/hal-01509746/document
	// [2] http://jcgt.org/published/0007/04/01/
	// [4] http://jcgt.org/published/0003/02/03/

	// trowbridge-reitz === GGX === GTR

	vec3 ggxDirection( vec3 incidentDir, vec2 roughness, vec2 uv ) {

		// TODO: try GGXVNDF implementation from reference [2], here. Needs to update ggxDistribution
		// function below, as well

		// Implementation from reference [1]
		// stretch view
		vec3 V = normalize( vec3( roughness * incidentDir.xy, incidentDir.z ) );

		// orthonormal basis
		vec3 T1 = ( V.z < 0.9999 ) ? normalize( cross( V, vec3( 0.0, 0.0, 1.0 ) ) ) : vec3( 1.0, 0.0, 0.0 );
		vec3 T2 = cross( T1, V );

		// sample point with polar coordinates (r, phi)
		float a = 1.0 / ( 1.0 + V.z );
		float r = sqrt( uv.x );
		float phi = ( uv.y < a ) ? uv.y / a * PI : PI + ( uv.y - a ) / ( 1.0 - a ) * PI;
		float P1 = r * cos( phi );
		float P2 = r * sin( phi ) * ( ( uv.y < a ) ? 1.0 : V.z );

		// compute normal
		vec3 N = P1 * T1 + P2 * T2 + V * sqrt( max( 0.0, 1.0 - P1 * P1 - P2 * P2 ) );

		// unstretch
		N = normalize( vec3( roughness * N.xy, max( 0.0, N.z ) ) );

		return N;

	}

	// Below are PDF and related functions for use in a Monte Carlo path tracer
	// as specified in Appendix B of the following paper
	// See equation (34) from reference [0]
	float ggxLamda( float theta, float roughness ) {

		float tanTheta = tan( theta );
		float tanTheta2 = tanTheta * tanTheta;
		float alpha2 = roughness * roughness;

		float numerator = - 1.0 + sqrt( 1.0 + alpha2 * tanTheta2 );
		return numerator / 2.0;

	}

	// See equation (34) from reference [0]
	float ggxShadowMaskG1( float theta, float roughness ) {

		return 1.0 / ( 1.0 + ggxLamda( theta, roughness ) );

	}

	// See equation (125) from reference [4]
	float ggxShadowMaskG2( vec3 wi, vec3 wo, float roughness ) {

		float incidentTheta = acos( wi.z );
		float scatterTheta = acos( wo.z );
		return 1.0 / ( 1.0 + ggxLamda( incidentTheta, roughness ) + ggxLamda( scatterTheta, roughness ) );

	}

	// See equation (33) from reference [0]
	float ggxDistribution( vec3 halfVector, float roughness ) {

		float a2 = roughness * roughness;
		a2 = max( EPSILON, a2 );
		float cosTheta = halfVector.z;
		float cosTheta4 = pow( cosTheta, 4.0 );

		if ( cosTheta == 0.0 ) return 0.0;

		float theta = acosSafe( halfVector.z );
		float tanTheta = tan( theta );
		float tanTheta2 = pow( tanTheta, 2.0 );

		float denom = PI * cosTheta4 * pow( a2 + tanTheta2, 2.0 );
		return ( a2 / denom );

	}

	// See equation (3) from reference [2]
	float ggxPDF( vec3 wi, vec3 halfVector, float roughness ) {

		float incidentTheta = acos( wi.z );
		float D = ggxDistribution( halfVector, roughness );
		float G1 = ggxShadowMaskG1( incidentTheta, roughness );

		return D * G1 * max( 0.0, dot( wi, halfVector ) ) / wi.z;

	}

`;var Nn=`

	// XYZ to sRGB color space
	const mat3 XYZ_TO_REC709 = mat3(
		3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);

	vec3 fresnel0ToIor( vec3 fresnel0 ) {

		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );

	}

	// Conversion FO/IOR
	vec3 iorToFresnel0( vec3 transmittedIor, float incidentIor ) {

		return square( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );

	}

	// ior is a value between 1.0 and 3.0. 1.0 is air interface
	float iorToFresnel0( float transmittedIor, float incidentIor ) {

		return square( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) );

	}

	// Fresnel equations for dielectric/dielectric interfaces. See https://belcour.github.io/blog/research/2017/05/01/brdf-thin-film.html
	vec3 evalSensitivity( float OPD, vec3 shift ) {

		float phase = 2.0 * PI * OPD * 1.0e-9;

		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );

		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - square( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * square( phase ) );
		xyz /= 1.0685e-7;

		vec3 srgb = XYZ_TO_REC709 * xyz;
		return srgb;

	}

	// See Section 4. Analytic Spectral Integration, A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence, https://hal.archives-ouvertes.fr/hal-01518344/document
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {

		vec3 I;

		// Force iridescenceIor -> outsideIOR when thinFilmThickness -> 0.0
		float iridescenceIor = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );

		// Evaluate the cosTheta on the base layer (Snell law)
		float sinTheta2Sq = square( outsideIOR / iridescenceIor ) * ( 1.0 - square( cosTheta1 ) );

		// Handle TIR:
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {

			return vec3( 1.0 );

		}

		float cosTheta2 = sqrt( cosTheta2Sq );

		// First interface
		float R0 = iorToFresnel0( iridescenceIor, outsideIOR );
		float R12 = schlickFresnel( cosTheta1, R0 );
		float R21 = R12;
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIor < outsideIOR ) {

			phi12 = PI;

		}

		float phi21 = PI - phi12;

		// Second interface
		vec3 baseIOR = fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) ); // guard against 1.0
		vec3 R1 = iorToFresnel0( baseIOR, iridescenceIor );
		vec3 R23 = schlickFresnel( cosTheta2, R1 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[0] < iridescenceIor ) {

			phi23[ 0 ] = PI;

		}

		if ( baseIOR[1] < iridescenceIor ) {

			phi23[ 1 ] = PI;

		}

		if ( baseIOR[2] < iridescenceIor ) {

			phi23[ 2 ] = PI;

		}

		// Phase shift
		float OPD = 2.0 * iridescenceIor * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;

		// Compound terms
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = square( T121 ) * R23 / ( vec3( 1.0 ) - R123 );

		// Reflectance term for m = 0 (DC term amplitude)
		vec3 C0 = R12 + Rs;
		I = C0;

		// Reflectance term for m > 0 (pairs of diracs)
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {

			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;

		}

		// Since out of gamut colors might be produced, negative color values are clamped to 0.
		return max( I, vec3( 0.0 ) );

	}

`;var Ln=`

	// See equation (2) in http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
	float velvetD( float cosThetaH, float roughness ) {

		float alpha = max( roughness, 0.07 );
		alpha = alpha * alpha;

		float invAlpha = 1.0 / alpha;

		float sqrCosThetaH = cosThetaH * cosThetaH;
		float sinThetaH = max( 1.0 - sqrCosThetaH, 0.001 );

		return ( 2.0 + invAlpha ) * pow( sinThetaH, 0.5 * invAlpha ) / ( 2.0 * PI );

	}

	float velvetParamsInterpolate( int i, float oneMinusAlphaSquared ) {

		const float p0[5] = float[5]( 25.3245, 3.32435, 0.16801, -1.27393, -4.85967 );
		const float p1[5] = float[5]( 21.5473, 3.82987, 0.19823, -1.97760, -4.32054 );

		return mix( p1[i], p0[i], oneMinusAlphaSquared );

	}

	float velvetL( float x, float alpha ) {

		float oneMinusAlpha = 1.0 - alpha;
		float oneMinusAlphaSquared = oneMinusAlpha * oneMinusAlpha;

		float a = velvetParamsInterpolate( 0, oneMinusAlphaSquared );
		float b = velvetParamsInterpolate( 1, oneMinusAlphaSquared );
		float c = velvetParamsInterpolate( 2, oneMinusAlphaSquared );
		float d = velvetParamsInterpolate( 3, oneMinusAlphaSquared );
		float e = velvetParamsInterpolate( 4, oneMinusAlphaSquared );

		return a / ( 1.0 + b * pow( abs( x ), c ) ) + d * x + e;

	}

	// See equation (3) in http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
	float velvetLambda( float cosTheta, float alpha ) {

		return abs( cosTheta ) < 0.5 ? exp( velvetL( cosTheta, alpha ) ) : exp( 2.0 * velvetL( 0.5, alpha ) - velvetL( 1.0 - cosTheta, alpha ) );

	}

	// See Section 3, Shadowing Term, in http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
	float velvetG( float cosThetaO, float cosThetaI, float roughness ) {

		float alpha = max( roughness, 0.07 );
		alpha = alpha * alpha;

		return 1.0 / ( 1.0 + velvetLambda( cosThetaO, alpha ) + velvetLambda( cosThetaI, alpha ) );

	}

	float directionalAlbedoSheen( float cosTheta, float alpha ) {

		cosTheta = saturate( cosTheta );

		float c = 1.0 - cosTheta;
		float c3 = c * c * c;

		return 0.65584461 * c3 + 1.0 / ( 4.16526551 + exp( -7.97291361 * sqrt( alpha ) + 6.33516894 ) );

	}

	float sheenAlbedoScaling( vec3 wo, vec3 wi, SurfaceRecord surf ) {

		float alpha = max( surf.sheenRoughness, 0.07 );
		alpha = alpha * alpha;

		float maxSheenColor = max( max( surf.sheenColor.r, surf.sheenColor.g ), surf.sheenColor.b );

		float eWo = directionalAlbedoSheen( saturateCos( wo.z ), alpha );
		float eWi = directionalAlbedoSheen( saturateCos( wi.z ), alpha );

		return min( 1.0 - maxSheenColor * eWo, 1.0 - maxSheenColor * eWi );

	}

	// See Section 5, Layering, in http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
	float sheenAlbedoScaling( vec3 wo, SurfaceRecord surf ) {

		float alpha = max( surf.sheenRoughness, 0.07 );
		alpha = alpha * alpha;

		float maxSheenColor = max( max( surf.sheenColor.r, surf.sheenColor.g ), surf.sheenColor.b );

		float eWo = directionalAlbedoSheen( saturateCos( wo.z ), alpha );

		return 1.0 - maxSheenColor * eWo;

	}

`;var On=`

#ifndef FOG_CHECK_ITERATIONS
#define FOG_CHECK_ITERATIONS 30
#endif

// returns whether the given material is a fog material or not
bool isMaterialFogVolume( sampler2D materials, uint materialIndex ) {

	uint i = materialIndex * uint( MATERIAL_PIXELS );
	vec4 s14 = texelFetch1D( materials, i + 14u );
	return bool( int( s14.b ) & 4 );

}

// returns true if we're within the first fog volume we hit
bool bvhIntersectFogVolumeHit(
	vec3 rayOrigin, vec3 rayDirection,
	usampler2D materialIndexAttribute, sampler2D materials,
	inout Material material
) {

	material.fogVolume = false;

	for ( int i = 0; i < FOG_CHECK_ITERATIONS; i ++ ) {

		// find nearest hit
		uvec4 faceIndices = uvec4( 0u );
		vec3 faceNormal = vec3( 0.0, 0.0, 1.0 );
		vec3 barycoord = vec3( 0.0 );
		float side = 1.0;
		float dist = 0.0;
		bool hit = bvhIntersectFirstHit( bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist );
		if ( hit ) {

			// if it's a fog volume return whether we hit the front or back face
			uint materialIndex = uTexelFetch1D( materialIndexAttribute, faceIndices.x ).r;
			if ( isMaterialFogVolume( materials, materialIndex ) ) {

				material = readMaterialInfo( materials, materialIndex );
				return side == - 1.0;

			} else {

				// move the ray forward
				rayOrigin = stepRayOrigin( rayOrigin, rayDirection, - faceNormal, dist );

			}

		} else {

			return false;

		}

	}

	return false;

}

`;var zn=`

	// step through multiple surface hits and accumulate color attenuation based on transmissive surfaces
	// returns true if a solid surface was hit
	bool attenuateHit(
		RenderState state,
		Ray ray, float rayDist,
		out vec3 color
	) {

		// store the original bounce index so we can reset it after
		uint originalBounceIndex = sobolBounceIndex;

		int traversals = state.traversals;
		int transmissiveTraversals = state.transmissiveTraversals;
		bool isShadowRay = state.isShadowRay;
		Material fogMaterial = state.fogMaterial;

		vec3 startPoint = ray.origin;

		// hit results
		SurfaceHit surfaceHit;

		color = vec3( 1.0 );

		bool result = true;
		for ( int i = 0; i < traversals; i ++ ) {

			sobolBounceIndex ++;

			int hitType = traceScene( ray, fogMaterial, surfaceHit );

			if ( hitType == FOG_HIT ) {

				result = true;
				break;

			} else if ( hitType == SURFACE_HIT ) {

				float totalDist = distance( startPoint, ray.origin + ray.direction * surfaceHit.dist );
				if ( totalDist > rayDist ) {

					result = false;
					break;

				}

				// TODO: attenuate the contribution based on the PDF of the resulting ray including refraction values
				// Should be able to work using the material BSDF functions which will take into account specularity, etc.
				// TODO: should we account for emissive surfaces here?

				uint materialIndex = uTexelFetch1D( materialIndexAttribute, surfaceHit.faceIndices.x ).r;
				Material material = readMaterialInfo( materials, materialIndex );

				// adjust the ray to the new surface
				bool isEntering = surfaceHit.side == 1.0;
				ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );

				#if FEATURE_FOG

				if ( material.fogVolume ) {

					fogMaterial = material;
					fogMaterial.fogVolume = surfaceHit.side == 1.0;
					i -= sign( transmissiveTraversals );
					transmissiveTraversals --;
					continue;

				}

				#endif

				if ( ! material.castShadow && isShadowRay ) {

					continue;

				}

				vec2 uv = textureSampleBarycoord( attributesArray, ATTR_UV, surfaceHit.barycoord, surfaceHit.faceIndices.xyz ).xy;
				vec4 vertexColor = textureSampleBarycoord( attributesArray, ATTR_COLOR, surfaceHit.barycoord, surfaceHit.faceIndices.xyz );

				// albedo
				vec4 albedo = vec4( material.color, material.opacity );
				if ( material.map != - 1 ) {

					vec3 uvPrime = material.mapTransform * vec3( uv, 1 );
					albedo *= texture2D( textures, vec3( uvPrime.xy, material.map ) );

				}

				if ( material.vertexColors ) {

					albedo *= vertexColor;

				}

				// alphaMap
				if ( material.alphaMap != - 1 ) {

					vec3 uvPrime = material.alphaMapTransform * vec3( uv, 1 );
					albedo.a *= texture2D( textures, vec3( uvPrime.xy, material.alphaMap ) ).x;

				}

				// transmission
				float transmission = material.transmission;
				if ( material.transmissionMap != - 1 ) {

					vec3 uvPrime = material.transmissionMapTransform * vec3( uv, 1 );
					transmission *= texture2D( textures, vec3( uvPrime.xy, material.transmissionMap ) ).r;

				}

				// metalness
				float metalness = material.metalness;
				if ( material.metalnessMap != - 1 ) {

					vec3 uvPrime = material.metalnessMapTransform * vec3( uv, 1 );
					metalness *= texture2D( textures, vec3( uvPrime.xy, material.metalnessMap ) ).b;

				}

				float alphaTest = material.alphaTest;
				bool useAlphaTest = alphaTest != 0.0;
				float transmissionFactor = ( 1.0 - metalness ) * transmission;
				if (
					transmissionFactor < rand( 9 ) && ! (
						// material sidedness
						material.side != 0.0 && surfaceHit.side == material.side

						// alpha test
						|| useAlphaTest && albedo.a < alphaTest

						// opacity
						|| material.transparent && ! useAlphaTest && albedo.a < rand( 10 )
					)
				) {

					result = true;
					break;

				}

				if ( surfaceHit.side == 1.0 && isEntering ) {

					// only attenuate by surface color on the way in
					color *= mix( vec3( 1.0 ), albedo.rgb, transmissionFactor );

				} else if ( surfaceHit.side == - 1.0 ) {

					// attenuate by medium once we hit the opposite side of the model
					color *= transmissionAttenuation( surfaceHit.dist, material.attenuationColor, material.attenuationDistance );

				}

				bool isTransmissiveRay = dot( ray.direction, surfaceHit.faceNormal * surfaceHit.side ) < 0.0;
				if ( ( isTransmissiveRay || isEntering ) && transmissiveTraversals > 0 ) {

					i -= sign( transmissiveTraversals );
					transmissiveTraversals --;

				}

			} else {

				result = false;
				break;

			}

		}

		// reset the bounce index
		sobolBounceIndex = originalBounceIndex;
		return result;

	}

`;var kn=`

	vec3 ndcToRayOrigin( vec2 coord ) {

		vec4 rayOrigin4 = cameraWorldMatrix * invProjectionMatrix * vec4( coord, - 1.0, 1.0 );
		return rayOrigin4.xyz / rayOrigin4.w;
	}

	Ray getCameraRay() {

		vec2 ssd = vec2( 1.0 ) / resolution;

		// Jitter the camera ray by finding a uv coordinate at a random sample
		// around this pixel's UV coordinate for AA
		vec2 ruv = rand2( 0 );
		vec2 jitteredUv = vUv + vec2( tentFilter( ruv.x ) * ssd.x, tentFilter( ruv.y ) * ssd.y );
		Ray ray;

		#if CAMERA_TYPE == 2

			// Equirectangular projection
			vec4 rayDirection4 = vec4( equirectUvToDirection( jitteredUv ), 0.0 );
			vec4 rayOrigin4 = vec4( 0.0, 0.0, 0.0, 1.0 );

			rayDirection4 = cameraWorldMatrix * rayDirection4;
			rayOrigin4 = cameraWorldMatrix * rayOrigin4;

			ray.direction = normalize( rayDirection4.xyz );
			ray.origin = rayOrigin4.xyz / rayOrigin4.w;

		#else

			// get [- 1, 1] normalized device coordinates
			vec2 ndc = 2.0 * jitteredUv - vec2( 1.0 );
			ray.origin = ndcToRayOrigin( ndc );

			#if CAMERA_TYPE == 1

				// Orthographic projection
				ray.direction = ( cameraWorldMatrix * vec4( 0.0, 0.0, - 1.0, 0.0 ) ).xyz;
				ray.direction = normalize( ray.direction );

			#else

				// Perspective projection
				ray.direction = normalize( mat3( cameraWorldMatrix ) * ( invProjectionMatrix * vec4( ndc, 0.0, 1.0 ) ).xyz );

			#endif

		#endif

		#if FEATURE_DOF
		{

			// depth of field
			vec3 focalPoint = ray.origin + normalize( ray.direction ) * physicalCamera.focusDistance;

			// get the aperture sample
			// if blades === 0 then we assume a circle
			vec3 shapeUVW= rand3( 1 );
			int blades = physicalCamera.apertureBlades;
			float anamorphicRatio = physicalCamera.anamorphicRatio;
			vec2 apertureSample = sampleAperture( blades, shapeUVW );
			apertureSample *= physicalCamera.bokehSize * 0.5 * 1e-3;

			// rotate the aperture shape
			apertureSample =
				rotateVector( apertureSample, physicalCamera.apertureRotation ) *
				saturate( vec2( anamorphicRatio, 1.0 / anamorphicRatio ) );

			// create the new ray
			ray.origin += ( cameraWorldMatrix * vec4( apertureSample, 0.0, 0.0 ) ).xyz;
			ray.direction = focalPoint - ray.origin;

		}
		#endif

		ray.direction = normalize( ray.direction );

		return ray;

	}

`;var Hn=`

	vec3 directLightContribution( vec3 worldWo, SurfaceRecord surf, RenderState state, vec3 rayOrigin ) {

		vec3 result = vec3( 0.0 );

		// uniformly pick a light or environment map
		if( lightsDenom != 0.0 && rand( 5 ) < float( lights.count ) / lightsDenom ) {

			// sample a light or environment
			LightRecord lightRec = randomLightSample( lights.tex, iesProfiles, lights.count, rayOrigin, rand3( 6 ) );

			bool isSampleBelowSurface = ! surf.volumeParticle && dot( surf.faceNormal, lightRec.direction ) < 0.0;
			if ( isSampleBelowSurface ) {

				lightRec.pdf = 0.0;

			}

			// check if a ray could even reach the light area
			Ray lightRay;
			lightRay.origin = rayOrigin;
			lightRay.direction = lightRec.direction;
			vec3 attenuatedColor;
			if (
				lightRec.pdf > 0.0 &&
				isDirectionValid( lightRec.direction, surf.normal, surf.faceNormal ) &&
				! attenuateHit( state, lightRay, lightRec.dist, attenuatedColor )
			) {

				// get the material pdf
				vec3 sampleColor;
				float lightMaterialPdf = bsdfResult( worldWo, lightRec.direction, surf, sampleColor );
				bool isValidSampleColor = all( greaterThanEqual( sampleColor, vec3( 0.0 ) ) );
				if ( lightMaterialPdf > 0.0 && isValidSampleColor ) {

					// weight the direct light contribution
					float lightPdf = lightRec.pdf / lightsDenom;
					float misWeight = lightRec.type == SPOT_LIGHT_TYPE || lightRec.type == DIR_LIGHT_TYPE || lightRec.type == POINT_LIGHT_TYPE ? 1.0 : misHeuristic( lightPdf, lightMaterialPdf );
					result = attenuatedColor * lightRec.emission * state.throughputColor * sampleColor * misWeight / lightPdf;

				}

			}

		} else if ( envMapInfo.totalSum != 0.0 && environmentIntensity != 0.0 ) {

			// find a sample in the environment map to include in the contribution
			vec3 envColor, envDirection;
			float envPdf = sampleEquirectProbability( rand2( 7 ), envColor, envDirection );
			envDirection = invEnvRotation3x3 * envDirection;

			// this env sampling is not set up for transmissive sampling and yields overly bright
			// results so we ignore the sample in this case.
			// TODO: this should be improved but how? The env samples could traverse a few layers?
			bool isSampleBelowSurface = ! surf.volumeParticle && dot( surf.faceNormal, envDirection ) < 0.0;
			if ( isSampleBelowSurface ) {

				envPdf = 0.0;

			}

			// check if a ray could even reach the surface
			Ray envRay;
			envRay.origin = rayOrigin;
			envRay.direction = envDirection;
			vec3 attenuatedColor;
			if (
				envPdf > 0.0 &&
				isDirectionValid( envDirection, surf.normal, surf.faceNormal ) &&
				! attenuateHit( state, envRay, INFINITY, attenuatedColor )
			) {

				// get the material pdf
				vec3 sampleColor;
				float envMaterialPdf = bsdfResult( worldWo, envDirection, surf, sampleColor );
				bool isValidSampleColor = all( greaterThanEqual( sampleColor, vec3( 0.0 ) ) );
				if ( envMaterialPdf > 0.0 && isValidSampleColor ) {

					// weight the direct light contribution
					envPdf /= lightsDenom;
					float misWeight = misHeuristic( envPdf, envMaterialPdf );
					result = attenuatedColor * environmentIntensity * envColor * state.throughputColor * sampleColor * misWeight / envPdf;

				}

			}

		}

		// Function changed to have a single return statement to potentially help with crashes on Mac OS.
		// See issue #470
		return result;

	}

`;var Un=`

	#define SKIP_SURFACE 0
	#define HIT_SURFACE 1
	int getSurfaceRecord(
		Material material, SurfaceHit surfaceHit, sampler2DArray attributesArray,
		float accumulatedRoughness,
		inout SurfaceRecord surf
	) {

		if ( material.fogVolume ) {

			vec3 normal = vec3( 0, 0, 1 );

			SurfaceRecord fogSurface;
			fogSurface.volumeParticle = true;
			fogSurface.color = material.color;
			fogSurface.emission = material.emissiveIntensity * material.emissive;
			fogSurface.normal = normal;
			fogSurface.faceNormal = normal;
			fogSurface.clearcoatNormal = normal;

			surf = fogSurface;
			return HIT_SURFACE;

		}

		// uv coord for textures
		vec2 uv = textureSampleBarycoord( attributesArray, ATTR_UV, surfaceHit.barycoord, surfaceHit.faceIndices.xyz ).xy;
		vec4 vertexColor = textureSampleBarycoord( attributesArray, ATTR_COLOR, surfaceHit.barycoord, surfaceHit.faceIndices.xyz );

		// albedo
		vec4 albedo = vec4( material.color, material.opacity );
		if ( material.map != - 1 ) {

			vec3 uvPrime = material.mapTransform * vec3( uv, 1 );
			albedo *= texture2D( textures, vec3( uvPrime.xy, material.map ) );

		}

		if ( material.vertexColors ) {

			albedo *= vertexColor;

		}

		// alphaMap
		if ( material.alphaMap != - 1 ) {

			vec3 uvPrime = material.alphaMapTransform * vec3( uv, 1 );
			albedo.a *= texture2D( textures, vec3( uvPrime.xy, material.alphaMap ) ).x;

		}

		// possibly skip this sample if it's transparent, alpha test is enabled, or we hit the wrong material side
		// and it's single sided.
		// - alpha test is disabled when it === 0
		// - the material sidedness test is complicated because we want light to pass through the back side but still
		// be able to see the front side. This boolean checks if the side we hit is the front side on the first ray
		// and we're rendering the other then we skip it. Do the opposite on subsequent bounces to get incoming light.
		float alphaTest = material.alphaTest;
		bool useAlphaTest = alphaTest != 0.0;
		if (
			// material sidedness
			material.side != 0.0 && surfaceHit.side != material.side

			// alpha test
			|| useAlphaTest && albedo.a < alphaTest

			// opacity
			|| material.transparent && ! useAlphaTest && albedo.a < rand( 3 )
		) {

			return SKIP_SURFACE;

		}

		// fetch the interpolated smooth normal
		vec3 normal = normalize( textureSampleBarycoord(
			attributesArray,
			ATTR_NORMAL,
			surfaceHit.barycoord,
			surfaceHit.faceIndices.xyz
		).xyz );

		// roughness
		float roughness = material.roughness;
		if ( material.roughnessMap != - 1 ) {

			vec3 uvPrime = material.roughnessMapTransform * vec3( uv, 1 );
			roughness *= texture2D( textures, vec3( uvPrime.xy, material.roughnessMap ) ).g;

		}

		// metalness
		float metalness = material.metalness;
		if ( material.metalnessMap != - 1 ) {

			vec3 uvPrime = material.metalnessMapTransform * vec3( uv, 1 );
			metalness *= texture2D( textures, vec3( uvPrime.xy, material.metalnessMap ) ).b;

		}

		// emission
		vec3 emission = material.emissiveIntensity * material.emissive;
		if ( material.emissiveMap != - 1 ) {

			vec3 uvPrime = material.emissiveMapTransform * vec3( uv, 1 );
			emission *= texture2D( textures, vec3( uvPrime.xy, material.emissiveMap ) ).xyz;

		}

		// transmission
		float transmission = material.transmission;
		if ( material.transmissionMap != - 1 ) {

			vec3 uvPrime = material.transmissionMapTransform * vec3( uv, 1 );
			transmission *= texture2D( textures, vec3( uvPrime.xy, material.transmissionMap ) ).r;

		}

		// normal
		if ( material.flatShading ) {

			// if we're rendering a flat shaded object then use the face normals - the face normal
			// is provided based on the side the ray hits the mesh so flip it to align with the
			// interpolated vertex normals.
			normal = surfaceHit.faceNormal * surfaceHit.side;

		}

		vec3 baseNormal = normal;
		if ( material.normalMap != - 1 ) {

			vec4 tangentSample = textureSampleBarycoord(
				attributesArray,
				ATTR_TANGENT,
				surfaceHit.barycoord,
				surfaceHit.faceIndices.xyz
			);

			// some provided tangents can be malformed (0, 0, 0) causing the normal to be degenerate
			// resulting in NaNs and slow path tracing.
			if ( length( tangentSample.xyz ) > 0.0 ) {

				vec3 tangent = normalize( tangentSample.xyz );
				vec3 bitangent = normalize( cross( normal, tangent ) * tangentSample.w );
				mat3 vTBN = mat3( tangent, bitangent, normal );

				vec3 uvPrime = material.normalMapTransform * vec3( uv, 1 );
				vec3 texNormal = texture2D( textures, vec3( uvPrime.xy, material.normalMap ) ).xyz * 2.0 - 1.0;
				texNormal.xy *= material.normalScale;
				normal = vTBN * texNormal;

			}

		}

		normal *= surfaceHit.side;

		// clearcoat
		float clearcoat = material.clearcoat;
		if ( material.clearcoatMap != - 1 ) {

			vec3 uvPrime = material.clearcoatMapTransform * vec3( uv, 1 );
			clearcoat *= texture2D( textures, vec3( uvPrime.xy, material.clearcoatMap ) ).r;

		}

		// clearcoatRoughness
		float clearcoatRoughness = material.clearcoatRoughness;
		if ( material.clearcoatRoughnessMap != - 1 ) {

			vec3 uvPrime = material.clearcoatRoughnessMapTransform * vec3( uv, 1 );
			clearcoatRoughness *= texture2D( textures, vec3( uvPrime.xy, material.clearcoatRoughnessMap ) ).g;

		}

		// clearcoatNormal
		vec3 clearcoatNormal = baseNormal;
		if ( material.clearcoatNormalMap != - 1 ) {

			vec4 tangentSample = textureSampleBarycoord(
				attributesArray,
				ATTR_TANGENT,
				surfaceHit.barycoord,
				surfaceHit.faceIndices.xyz
			);

			// some provided tangents can be malformed (0, 0, 0) causing the normal to be degenerate
			// resulting in NaNs and slow path tracing.
			if ( length( tangentSample.xyz ) > 0.0 ) {

				vec3 tangent = normalize( tangentSample.xyz );
				vec3 bitangent = normalize( cross( clearcoatNormal, tangent ) * tangentSample.w );
				mat3 vTBN = mat3( tangent, bitangent, clearcoatNormal );

				vec3 uvPrime = material.clearcoatNormalMapTransform * vec3( uv, 1 );
				vec3 texNormal = texture2D( textures, vec3( uvPrime.xy, material.clearcoatNormalMap ) ).xyz * 2.0 - 1.0;
				texNormal.xy *= material.clearcoatNormalScale;
				clearcoatNormal = vTBN * texNormal;

			}

		}

		clearcoatNormal *= surfaceHit.side;

		// sheenColor
		vec3 sheenColor = material.sheenColor;
		if ( material.sheenColorMap != - 1 ) {

			vec3 uvPrime = material.sheenColorMapTransform * vec3( uv, 1 );
			sheenColor *= texture2D( textures, vec3( uvPrime.xy, material.sheenColorMap ) ).rgb;

		}

		// sheenRoughness
		float sheenRoughness = material.sheenRoughness;
		if ( material.sheenRoughnessMap != - 1 ) {

			vec3 uvPrime = material.sheenRoughnessMapTransform * vec3( uv, 1 );
			sheenRoughness *= texture2D( textures, vec3( uvPrime.xy, material.sheenRoughnessMap ) ).a;

		}

		// iridescence
		float iridescence = material.iridescence;
		if ( material.iridescenceMap != - 1 ) {

			vec3 uvPrime = material.iridescenceMapTransform * vec3( uv, 1 );
			iridescence *= texture2D( textures, vec3( uvPrime.xy, material.iridescenceMap ) ).r;

		}

		// iridescence thickness
		float iridescenceThickness = material.iridescenceThicknessMaximum;
		if ( material.iridescenceThicknessMap != - 1 ) {

			vec3 uvPrime = material.iridescenceThicknessMapTransform * vec3( uv, 1 );
			float iridescenceThicknessSampled = texture2D( textures, vec3( uvPrime.xy, material.iridescenceThicknessMap ) ).g;
			iridescenceThickness = mix( material.iridescenceThicknessMinimum, material.iridescenceThicknessMaximum, iridescenceThicknessSampled );

		}

		iridescence = iridescenceThickness == 0.0 ? 0.0 : iridescence;

		// specular color
		vec3 specularColor = material.specularColor;
		if ( material.specularColorMap != - 1 ) {

			vec3 uvPrime = material.specularColorMapTransform * vec3( uv, 1 );
			specularColor *= texture2D( textures, vec3( uvPrime.xy, material.specularColorMap ) ).rgb;

		}

		// specular intensity
		float specularIntensity = material.specularIntensity;
		if ( material.specularIntensityMap != - 1 ) {

			vec3 uvPrime = material.specularIntensityMapTransform * vec3( uv, 1 );
			specularIntensity *= texture2D( textures, vec3( uvPrime.xy, material.specularIntensityMap ) ).a;

		}

		surf.volumeParticle = false;

		surf.faceNormal = surfaceHit.faceNormal;
		surf.normal = normal;

		surf.metalness = metalness;
		surf.color = albedo.rgb;
		surf.emission = emission;

		surf.ior = material.ior;
		surf.transmission = transmission;
		surf.thinFilm = material.thinFilm;
		surf.attenuationColor = material.attenuationColor;
		surf.attenuationDistance = material.attenuationDistance;

		surf.clearcoatNormal = clearcoatNormal;
		surf.clearcoat = clearcoat;

		surf.sheen = material.sheen;
		surf.sheenColor = sheenColor;

		surf.iridescence = iridescence;
		surf.iridescenceIor = material.iridescenceIor;
		surf.iridescenceThickness = iridescenceThickness;

		surf.specularColor = specularColor;
		surf.specularIntensity = specularIntensity;

		// apply perceptual roughness factor from gltf. sheen perceptual roughness is
		// applied by its brdf function
		// https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#microfacet-surfaces
		surf.roughness = roughness * roughness;
		surf.clearcoatRoughness = clearcoatRoughness * clearcoatRoughness;
		surf.sheenRoughness = sheenRoughness;

		// frontFace is used to determine transmissive properties and PDF. If no transmission is used
		// then we can just always assume this is a front face.
		surf.frontFace = surfaceHit.side == 1.0 || transmission == 0.0;
		surf.eta = material.thinFilm || surf.frontFace ? 1.0 / material.ior : material.ior;
		surf.f0 = iorRatioToF0( surf.eta );

		// Compute the filtered roughness value to use during specular reflection computations.
		// The accumulated roughness value is scaled by a user setting and a "magic value" of 5.0.
		// If we're exiting something transmissive then scale the factor down significantly so we can retain
		// sharp internal reflections
		surf.filteredRoughness = applyFilteredGlossy( surf.roughness, accumulatedRoughness );
		surf.filteredClearcoatRoughness = applyFilteredGlossy( surf.clearcoatRoughness, accumulatedRoughness );

		// get the normal frames
		surf.normalBasis = getBasisFromNormal( surf.normal );
		surf.normalInvBasis = inverse( surf.normalBasis );

		surf.clearcoatBasis = getBasisFromNormal( surf.clearcoatNormal );
		surf.clearcoatInvBasis = inverse( surf.clearcoatBasis );

		return HIT_SURFACE;

	}
`;var Vn=`

	struct Ray {

		vec3 origin;
		vec3 direction;

	};

	struct SurfaceHit {

		uvec4 faceIndices;
		vec3 barycoord;
		vec3 faceNormal;
		float side;
		float dist;

	};

	struct RenderState {

		bool firstRay;
		bool transmissiveRay;
		bool isShadowRay;
		float accumulatedRoughness;
		int transmissiveTraversals;
		int traversals;
		uint depth;
		vec3 throughputColor;
		Material fogMaterial;

	};

	RenderState initRenderState() {

		RenderState result;
		result.firstRay = true;
		result.transmissiveRay = true;
		result.isShadowRay = false;
		result.accumulatedRoughness = 0.0;
		result.transmissiveTraversals = 0;
		result.traversals = 0;
		result.throughputColor = vec3( 1.0 );
		result.depth = 0u;
		result.fogMaterial.fogVolume = false;
		return result;

	}

`;var Wn=`

	#define NO_HIT 0
	#define SURFACE_HIT 1
	#define LIGHT_HIT 2
	#define FOG_HIT 3

	// Passing the global variable 'lights' into this function caused shader program errors.
	// So global variables like 'lights' and 'bvh' were moved out of the function parameters.
	// For more information, refer to: https://github.com/gkjohnson/three-gpu-pathtracer/pull/457
	int traceScene(
		Ray ray, Material fogMaterial, inout SurfaceHit surfaceHit
	) {

		int result = NO_HIT;
		bool hit = bvhIntersectFirstHit( bvh, ray.origin, ray.direction, surfaceHit.faceIndices, surfaceHit.faceNormal, surfaceHit.barycoord, surfaceHit.side, surfaceHit.dist );

		#if FEATURE_FOG

		if ( fogMaterial.fogVolume ) {

			// offset the distance so we don't run into issues with particles on the same surface
			// as other objects
			float particleDist = intersectFogVolume( fogMaterial, rand( 1 ) );
			if ( particleDist + RAY_OFFSET < surfaceHit.dist ) {

				surfaceHit.side = 1.0;
				surfaceHit.faceNormal = normalize( - ray.direction );
				surfaceHit.dist = particleDist;
				return FOG_HIT;

			}

		}

		#endif

		if ( hit ) {

			result = SURFACE_HIT;

		}

		return result;

	}

`;var Ar=class extends Q{onBeforeRender(){this.setDefine("FEATURE_DOF",this.physicalCamera.bokehSize===0?0:1),this.setDefine("FEATURE_BACKGROUND_MAP",this.backgroundMap?1:0),this.setDefine("FEATURE_FOG",this.materials.features.isUsed("FOG")?1:0)}constructor(e){super({transparent:!0,depthWrite:!1,defines:{FEATURE_MIS:1,FEATURE_RUSSIAN_ROULETTE:1,FEATURE_DOF:1,FEATURE_BACKGROUND_MAP:0,FEATURE_FOG:1,RANDOM_TYPE:2,CAMERA_TYPE:0,DEBUG_MODE:0,ATTR_NORMAL:0,ATTR_TANGENT:1,ATTR_UV:2,ATTR_COLOR:3,MATERIAL_PIXELS:yr},uniforms:{resolution:{value:new Qc},opacity:{value:1},bounces:{value:10},transmissiveBounces:{value:10},filterGlossyFactor:{value:0},physicalCamera:{value:new fr},cameraWorldMatrix:{value:new Ir},invProjectionMatrix:{value:new Ir},bvh:{value:new Kt},attributesArray:{value:new gr},materialIndexAttribute:{value:new Ve},materials:{value:new xr},textures:{value:new vt().texture},lights:{value:new hr},iesProfiles:{value:new vt(360,180,{type:jc,wrapS:Gn,wrapT:Gn}).texture},environmentIntensity:{value:1},environmentRotation:{value:new Ir},envMapInfo:{value:new dr},backgroundBlur:{value:0},backgroundMap:{value:null},backgroundAlpha:{value:1},backgroundIntensity:{value:1},backgroundRotation:{value:new Ir},seed:{value:0},sobolTexture:{value:null},stratifiedTexture:{value:new wr},stratifiedOffsetTexture:{value:new _r(64,1)}},vertexShader:`

				varying vec2 vUv;
				void main() {

					vec4 mvPosition = vec4( position, 1.0 );
					mvPosition = modelViewMatrix * mvPosition;
					gl_Position = projectionMatrix * mvPosition;

					vUv = uv;

				}

			`,fragmentShader:`
				#define RAY_OFFSET 1e-4
				#define INFINITY 1e20

				precision highp isampler2D;
				precision highp usampler2D;
				precision highp sampler2DArray;
				vec4 envMapTexelToLinear( vec4 a ) { return a; }
				#include <common>

				// bvh intersection
				${ve.common_functions}
				${ve.bvh_struct_definitions}
				${ve.bvh_ray_functions}

				// uniform structs
				${yn}
				${Tn}
				${bn}
				${wn}
				${Sn}

				// random
				#if RANDOM_TYPE == 2 	// Stratified List

					${Dn}

				#elif RANDOM_TYPE == 1 	// Sobol

					${Ti}
					${cr}
					${jo}

					#define rand(v) sobol(v)
					#define rand2(v) sobol2(v)
					#define rand3(v) sobol3(v)
					#define rand4(v) sobol4(v)

				#else 					// PCG

				${Ti}

					// Using the sobol functions seems to break the the compiler on MacOS
					// - specifically the "sobolReverseBits" function.
					uint sobolPixelIndex = 0u;
					uint sobolPathIndex = 0u;
					uint sobolBounceIndex = 0u;

					#define rand(v) pcgRand()
					#define rand2(v) pcgRand2()
					#define rand3(v) pcgRand3()
					#define rand4(v) pcgRand4()

				#endif

				// common
				${Mn}
				${Rn}
				${je}
				${Pn}
				${Fn}

				// environment
				uniform EquirectHdrInfo envMapInfo;
				uniform mat4 environmentRotation;
				uniform float environmentIntensity;

				// lighting
				uniform sampler2DArray iesProfiles;
				uniform LightsInfo lights;

				// background
				uniform float backgroundBlur;
				uniform float backgroundAlpha;
				#if FEATURE_BACKGROUND_MAP

				uniform sampler2D backgroundMap;
				uniform mat4 backgroundRotation;
				uniform float backgroundIntensity;

				#endif

				// camera
				uniform mat4 cameraWorldMatrix;
				uniform mat4 invProjectionMatrix;
				#if FEATURE_DOF

				uniform PhysicalCamera physicalCamera;

				#endif

				// geometry
				uniform sampler2DArray attributesArray;
				uniform usampler2D materialIndexAttribute;
				uniform sampler2D materials;
				uniform sampler2DArray textures;
				uniform BVH bvh;

				// path tracer
				uniform int bounces;
				uniform int transmissiveBounces;
				uniform float filterGlossyFactor;
				uniform int seed;

				// image
				uniform vec2 resolution;
				uniform float opacity;

				varying vec2 vUv;

				// globals
				mat3 envRotation3x3;
				mat3 invEnvRotation3x3;
				float lightsDenom;

				// sampling
				${An}
				${_n}
				${In}

				${On}
				${Bn}
				${Ln}
				${Nn}
				${En}
				${Cn}

				float applyFilteredGlossy( float roughness, float accumulatedRoughness ) {

					return clamp(
						max(
							roughness,
							accumulatedRoughness * filterGlossyFactor * 5.0 ),
						0.0,
						1.0
					);

				}

				vec3 sampleBackground( vec3 direction, vec2 uv ) {

					vec3 sampleDir = sampleHemisphere( direction, uv ) * 0.5 * backgroundBlur;

					#if FEATURE_BACKGROUND_MAP

					sampleDir = normalize( mat3( backgroundRotation ) * direction + sampleDir );
					return backgroundIntensity * sampleEquirectColor( backgroundMap, sampleDir );

					#else

					sampleDir = normalize( envRotation3x3 * direction + sampleDir );
					return environmentIntensity * sampleEquirectColor( envMapInfo.map, sampleDir );

					#endif

				}

				${Vn}
				${kn}
				${Wn}
				${zn}
				${Hn}
				${Un}

				void main() {

					// init
					rng_initialize( gl_FragCoord.xy, seed );
					sobolPixelIndex = ( uint( gl_FragCoord.x ) << 16 ) | uint( gl_FragCoord.y );
					sobolPathIndex = uint( seed );

					// get camera ray
					Ray ray = getCameraRay();

					// inverse environment rotation
					envRotation3x3 = mat3( environmentRotation );
					invEnvRotation3x3 = inverse( envRotation3x3 );
					lightsDenom =
						( environmentIntensity == 0.0 || envMapInfo.totalSum == 0.0 ) && lights.count != 0u ?
							float( lights.count ) :
							float( lights.count + 1u );

					// final color
					gl_FragColor = vec4( 0, 0, 0, 1 );

					// surface results
					SurfaceHit surfaceHit;
					ScatterRecord scatterRec;

					// path tracing state
					RenderState state = initRenderState();
					state.transmissiveTraversals = transmissiveBounces;
					#if FEATURE_FOG

					state.fogMaterial.fogVolume = bvhIntersectFogVolumeHit(
						ray.origin, - ray.direction,
						materialIndexAttribute, materials,
						state.fogMaterial
					);

					#endif

					for ( int i = 0; i < bounces; i ++ ) {

						sobolBounceIndex ++;

						state.depth ++;
						state.traversals = bounces - i;
						state.firstRay = i == 0 && state.transmissiveTraversals == transmissiveBounces;

						int hitType = traceScene( ray, state.fogMaterial, surfaceHit );

						// check if we intersect any lights and accumulate the light contribution
						// TODO: we can add support for light surface rendering in the else condition if we
						// add the ability to toggle visibility of the the light
						if ( ! state.firstRay && ! state.transmissiveRay ) {

							LightRecord lightRec;
							float lightDist = hitType == NO_HIT ? INFINITY : surfaceHit.dist;
							for ( uint i = 0u; i < lights.count; i ++ ) {

								if (
									intersectLightAtIndex( lights.tex, ray.origin, ray.direction, i, lightRec ) &&
									lightRec.dist < lightDist
								) {

									#if FEATURE_MIS

									// weight the contribution
									// NOTE: Only area lights are supported for forward sampling and can be hit
									float misWeight = misHeuristic( scatterRec.pdf, lightRec.pdf / lightsDenom );
									gl_FragColor.rgb += lightRec.emission * state.throughputColor * misWeight;

									#else

									gl_FragColor.rgb += lightRec.emission * state.throughputColor;

									#endif

								}

							}

						}

						if ( hitType == NO_HIT ) {

							if ( state.firstRay || state.transmissiveRay ) {

								gl_FragColor.rgb += sampleBackground( ray.direction, rand2( 2 ) ) * state.throughputColor;
								gl_FragColor.a = backgroundAlpha;

							} else {

								#if FEATURE_MIS

								// get the PDF of the hit envmap point
								vec3 envColor;
								float envPdf = sampleEquirect( envRotation3x3 * ray.direction, envColor );
								envPdf /= lightsDenom;

								// and weight the contribution
								float misWeight = misHeuristic( scatterRec.pdf, envPdf );
								gl_FragColor.rgb += environmentIntensity * envColor * state.throughputColor * misWeight;

								#else

								gl_FragColor.rgb +=
									environmentIntensity *
									sampleEquirectColor( envMapInfo.map, envRotation3x3 * ray.direction ) *
									state.throughputColor;

								#endif

							}
							break;

						}

						uint materialIndex = uTexelFetch1D( materialIndexAttribute, surfaceHit.faceIndices.x ).r;
						Material material = readMaterialInfo( materials, materialIndex );

						#if FEATURE_FOG

						if ( hitType == FOG_HIT ) {

							material = state.fogMaterial;
							state.accumulatedRoughness += 0.2;

						} else if ( material.fogVolume ) {

							state.fogMaterial = material;
							state.fogMaterial.fogVolume = surfaceHit.side == 1.0;

							ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );

							i -= sign( state.transmissiveTraversals );
							state.transmissiveTraversals -= sign( state.transmissiveTraversals );
							continue;

						}

						#endif

						// early out if this is a matte material
						if ( material.matte && state.firstRay ) {

							gl_FragColor = vec4( 0.0 );
							break;

						}

						// if we've determined that this is a shadow ray and we've hit an item with no shadow casting
						// then skip it
						if ( ! material.castShadow && state.isShadowRay ) {

							ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );
							continue;

						}

						SurfaceRecord surf;
						if (
							getSurfaceRecord(
								material, surfaceHit, attributesArray, state.accumulatedRoughness,
								surf
							) == SKIP_SURFACE
						) {

							// only allow a limited number of transparency discards otherwise we could
							// crash the context with too long a loop.
							i -= sign( state.transmissiveTraversals );
							state.transmissiveTraversals -= sign( state.transmissiveTraversals );

							ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );
							continue;

						}

						scatterRec = bsdfSample( - ray.direction, surf );
						state.isShadowRay = scatterRec.specularPdf < rand( 4 );

						bool isBelowSurface = ! surf.volumeParticle && dot( scatterRec.direction, surf.faceNormal ) < 0.0;
						vec3 hitPoint = stepRayOrigin( ray.origin, ray.direction, isBelowSurface ? - surf.faceNormal : surf.faceNormal, surfaceHit.dist );

						// next event estimation
						#if FEATURE_MIS

						gl_FragColor.rgb += directLightContribution( - ray.direction, surf, state, hitPoint );

						#endif

						// accumulate a roughness value to offset diffuse, specular, diffuse rays that have high contribution
						// to a single pixel resulting in fireflies
						// TODO: handle transmissive surfaces
						if ( ! surf.volumeParticle && ! isBelowSurface ) {

							// determine if this is a rough normal or not by checking how far off straight up it is
							vec3 halfVector = normalize( - ray.direction + scatterRec.direction );
							state.accumulatedRoughness += max(
								sin( acosApprox( dot( halfVector, surf.normal ) ) ),
								sin( acosApprox( dot( halfVector, surf.clearcoatNormal ) ) )
							);

							state.transmissiveRay = false;

						}

						// accumulate emissive color
						gl_FragColor.rgb += ( surf.emission * state.throughputColor );

						// skip the sample if our PDF or ray is impossible
						if ( scatterRec.pdf <= 0.0 || ! isDirectionValid( scatterRec.direction, surf.normal, surf.faceNormal ) ) {

							break;

						}

						// if we're bouncing around the inside a transmissive material then decrement
						// perform this separate from a bounce
						bool isTransmissiveRay = ! surf.volumeParticle && dot( scatterRec.direction, surf.faceNormal * surfaceHit.side ) < 0.0;
						if ( ( isTransmissiveRay || isBelowSurface ) && state.transmissiveTraversals > 0 ) {

							state.transmissiveTraversals --;
							i --;

						}

						//

						// handle throughput color transformation
						// attenuate the throughput color by the medium color
						if ( ! surf.frontFace ) {

							state.throughputColor *= transmissionAttenuation( surfaceHit.dist, surf.attenuationColor, surf.attenuationDistance );

						}

						#if FEATURE_RUSSIAN_ROULETTE

						// russian roulette path termination
						// https://www.arnoldrenderer.com/research/physically_based_shader_design_in_arnold.pdf
						uint minBounces = 3u;
						float depthProb = float( state.depth < minBounces );

						float rrProb = luminance( state.throughputColor * scatterRec.color / scatterRec.pdf );
						rrProb /= luminance( state.throughputColor );
						rrProb = sqrt( rrProb );
						rrProb = max( rrProb, depthProb );
						rrProb = min( rrProb, 1.0 );
						if ( rand( 8 ) > rrProb ) {

							break;

						}

						// perform sample clamping here to avoid bright pixels
						state.throughputColor *= min( 1.0 / rrProb, 20.0 );

						#endif

						// adjust the throughput and discard and exit if we find discard the sample if there are any NaNs
						state.throughputColor *= scatterRec.color / scatterRec.pdf;
						if ( any( isnan( state.throughputColor ) ) || any( isinf( state.throughputColor ) ) ) {

							break;

						}

						//

						// prepare for next ray
						ray.direction = scatterRec.direction;
						ray.origin = hitPoint;

					}

					gl_FragColor.a *= opacity;

					#if DEBUG_MODE == 1

					// output the number of rays checked in the path and number of
					// transmissive rays encountered.
					gl_FragColor.rgb = vec3(
						float( state.depth ),
						transmissiveBounces - state.transmissiveTraversals,
						0.0
					);
					gl_FragColor.a = 1.0;

					#endif

				}

			`}),this.setValues(e)}};function*tl(){let{_renderer:o,_fsQuad:e,_blendQuad:t,_primaryTarget:r,_blendTargets:n,_sobolTarget:s,_subframe:i,alpha:c,material:l}=this,m=new Ii,f=new Ii,u=t.material,[a,h]=n;for(;;){c?(u.opacity=this._opacityFactor/(this.samples+1),l.blending=Jc,l.opacity=1):(l.opacity=this._opacityFactor/(this.samples+1),l.blending=el);let[g,y,d,b]=i,p=r.width,v=r.height;l.resolution.set(p*d,v*b),l.sobolTexture=s.texture,l.stratifiedTexture.init(20,l.bounces+l.transmissiveBounces+5),l.stratifiedTexture.next(),l.seed++;let x=this.tiles.x||1,T=this.tiles.y||1,S=x*T,w=Math.ceil(p*d),A=Math.ceil(v*b),R=Math.floor(g*p),_=Math.floor(y*v),P=Math.ceil(w/x),I=Math.ceil(A/T);for(let F=0;F<T;F++)for(let M=0;M<x;M++){let D=o.getRenderTarget(),H=o.autoClear,_e=o.getScissorTest();o.getScissor(m),o.getViewport(f);let Ie=M,Ze=F;if(!this.stableTiles){let me=this._currentTile%(x*T);Ie=me%x,Ze=~~(me/x),this._currentTile=me+1}let Ae=T-Ze-1;r.scissor.set(R+Ie*P,_+Ae*I,Math.min(P,w-Ie*P),Math.min(I,A-Ae*I)),r.viewport.set(R,_,w,A),o.setRenderTarget(r),o.setScissorTest(!0),o.autoClear=!1,e.render(o),o.setViewport(f),o.setScissor(m),o.setScissorTest(_e),o.setRenderTarget(D),o.autoClear=H,c&&(u.target1=a.texture,u.target2=r.texture,o.setRenderTarget(h),t.render(o),o.setRenderTarget(D)),this.samples+=1/S,M===x-1&&F===T-1&&(this.samples=Math.round(this.samples)),yield}[a,h]=[h,a]}}var $n=new Kc,yt=class{get material(){return this._fsQuad.material}set material(e){this._fsQuad.material.removeEventListener("recompilation",this._compileFunction),e.addEventListener("recompilation",this._compileFunction),this._fsQuad.material=e}get target(){return this._alpha?this._blendTargets[1]:this._primaryTarget}set alpha(e){this._alpha!==e&&(e||(this._blendTargets[0].dispose(),this._blendTargets[1].dispose()),this._alpha=e,this.reset())}get alpha(){return this._alpha}get isCompiling(){return!!this._compilePromise}constructor(e){this.camera=null,this.tiles=new Zc(3,3),this.stableNoise=!1,this.stableTiles=!0,this.samples=0,this._subframe=new Ii(0,0,1,1),this._opacityFactor=1,this._renderer=e,this._alpha=!1,this._fsQuad=new Yn(new Ar),this._blendQuad=new Yn(new nr),this._task=null,this._currentTile=0,this._compilePromise=null,this._sobolTarget=new lr().generate(e),this._primaryTarget=new _i(1,1,{format:wi,type:Si,magFilter:Qe,minFilter:Qe}),this._blendTargets=[new _i(1,1,{format:wi,type:Si,magFilter:Qe,minFilter:Qe}),new _i(1,1,{format:wi,type:Si,magFilter:Qe,minFilter:Qe})],this._compileFunction=()=>{let t=this.compileMaterial(this._fsQuad._mesh);t.then(()=>{this._compilePromise===t&&(this._compilePromise=null)}),this._compilePromise=t},this.material.addEventListener("recompilation",this._compileFunction)}compileMaterial(){return this._renderer.compileAsync(this._fsQuad._mesh)}setCamera(e){let{material:t}=this;t.cameraWorldMatrix.copy(e.matrixWorld),t.invProjectionMatrix.copy(e.projectionMatrixInverse),t.physicalCamera.updateFrom(e);let r=0;e.projectionMatrix.elements[15]>0&&(r=1),e.isEquirectCamera&&(r=2),t.setDefine("CAMERA_TYPE",r),this.camera=e}setSize(e,t){e=Math.ceil(e),t=Math.ceil(t),!(this._primaryTarget.width===e&&this._primaryTarget.height===t)&&(this._primaryTarget.setSize(e,t),this._blendTargets[0].setSize(e,t),this._blendTargets[1].setSize(e,t),this.reset())}getSize(e){e.x=this._primaryTarget.width,e.y=this._primaryTarget.height}dispose(){this._primaryTarget.dispose(),this._blendTargets[0].dispose(),this._blendTargets[1].dispose(),this._sobolTarget.dispose(),this._fsQuad.dispose(),this._blendQuad.dispose(),this._task=null}reset(){let{_renderer:e,_primaryTarget:t,_blendTargets:r}=this,n=e.getRenderTarget(),s=e.getClearAlpha();e.getClearColor($n),e.setRenderTarget(t),e.setClearColor(0,0),e.clearColor(),e.setRenderTarget(r[0]),e.setClearColor(0,0),e.clearColor(),e.setRenderTarget(r[1]),e.setClearColor(0,0),e.clearColor(),e.setClearColor($n,s),e.setRenderTarget(n),this.samples=0,this._task=null,this.material.stratifiedTexture.stableNoise=this.stableNoise,this.stableNoise&&(this.material.seed=0,this.material.stratifiedTexture.reset())}update(){this.material.onBeforeRender(),!this.isCompiling&&(this._task||(this._task=tl.call(this)),this._task.next())}};import{FullScreenQuad as Pl}from"three/examples/jsm/postprocessing/Pass.js";import{Color as Kn,Vector3 as ul}from"three";import{ClampToEdgeWrapping as rl,Color as il,DataTexture as ol,EquirectangularReflectionMapping as nl,LinearFilter as Xn,RepeatWrapping as sl,RGBAFormat as al,Spherical as cl,Vector2 as Qn,FloatType as ll}from"three";var Se=new Qn,jn=new Qn,Rr=new cl,Pr=new il,Fr=class extends ol{constructor(e=512,t=512){super(new Float32Array(e*t*4),e,t,al,ll,nl,sl,rl,Xn,Xn),this.generationCallback=null}update(){this.dispose(),this.needsUpdate=!0;let{data:e,width:t,height:r}=this.image;for(let n=0;n<t;n++)for(let s=0;s<r;s++){jn.set(t,r),Se.set(n/t,s/r),Se.x-=.5,Se.y=1-Se.y,Rr.theta=Se.x*2*Math.PI,Rr.phi=Se.y*Math.PI,Rr.radius=1,this.generationCallback(Rr,Se,jn,Pr);let c=4*(s*t+n);e[c+0]=Pr.r,e[c+1]=Pr.g,e[c+2]=Pr.b,e[c+3]=1}}copy(e){return super.copy(e),this.generationCallback=e.generationCallback,this}};var Zn=new ul,Mr=class extends Fr{constructor(e=512){super(e,e),this.topColor=new Kn().set(16777215),this.bottomColor=new Kn().set(0),this.exponent=2,this.generationCallback=(t,r,n,s)=>{Zn.setFromSpherical(t);let i=Zn.y*.5+.5;s.lerpColors(this.bottomColor,this.topColor,i**this.exponent)}}copy(e){return super.copy(e),this.topColor.copy(e.topColor),this.bottomColor.copy(e.bottomColor),this}};import{ShaderMaterial as fl}from"three";var Dr=class extends fl{get map(){return this.uniforms.map.value}set map(e){this.uniforms.map.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}constructor(e){super({uniforms:{map:{value:null},opacity:{value:1}},vertexShader:`
				varying vec2 vUv;
				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}
			`,fragmentShader:`
				uniform sampler2D map;
				uniform float opacity;
				varying vec2 vUv;

				vec4 clampedTexelFatch( sampler2D map, ivec2 px, int lod ) {

					vec4 res = texelFetch( map, ivec2( px.x, px.y ), 0 );

					#if defined( TONE_MAPPING )

					res.xyz = toneMapping( res.xyz );

					#endif

			  		return linearToOutputTexel( res );

				}

				void main() {

					vec2 size = vec2( textureSize( map, 0 ) );
					vec2 pxUv = vUv * size;
					vec2 pxCurr = floor( pxUv );
					vec2 pxFrac = fract( pxUv ) - 0.5;
					vec2 pxOffset;
					pxOffset.x = pxFrac.x > 0.0 ? 1.0 : - 1.0;
					pxOffset.y = pxFrac.y > 0.0 ? 1.0 : - 1.0;

					vec2 pxNext = clamp( pxOffset + pxCurr, vec2( 0.0 ), size - 1.0 );
					vec2 alpha = abs( pxFrac );

					vec4 p1 = mix(
						clampedTexelFatch( map, ivec2( pxCurr.x, pxCurr.y ), 0 ),
						clampedTexelFatch( map, ivec2( pxNext.x, pxCurr.y ), 0 ),
						alpha.x
					);

					vec4 p2 = mix(
						clampedTexelFatch( map, ivec2( pxCurr.x, pxNext.y ), 0 ),
						clampedTexelFatch( map, ivec2( pxNext.x, pxNext.y ), 0 ),
						alpha.x
					);

					gl_FragColor = mix( p1, p2, alpha.y );
					gl_FragColor.a *= opacity;
					#include <premultiplied_alpha_fragment>

				}
			`}),this.setValues(e)}};import{DataTexture as ml,DataUtils as dl,EquirectangularReflectionMapping as hl,FloatType as pl,HalfFloatType as gl,LinearFilter as vl,LinearMipMapLinearFilter as xl,RGBAFormat as yl,RepeatWrapping as Jn,ShaderMaterial as bl,WebGLRenderTarget as Tl}from"three";import{FullScreenQuad as wl}from"three/examples/jsm/postprocessing/Pass.js";var Ai=class extends bl{constructor(){super({uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:`
				varying vec2 vUv;
				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`
				#define ENVMAP_TYPE_CUBE_UV

				uniform samplerCube envMap;
				uniform float flipEnvMap;
				varying vec2 vUv;

				#include <common>
				#include <cube_uv_reflection_fragment>

				${je}

				void main() {

					vec3 rayDirection = equirectUvToDirection( vUv );
					rayDirection.x *= flipEnvMap;
					gl_FragColor = textureCube( envMap, rayDirection );

				}`}),this.depthWrite=!1,this.depthTest=!1}},bt=class{constructor(e){this._renderer=e,this._quad=new wl(new Ai)}generate(e,t=null,r=null){if(!e.isCubeTexture)throw new Error("CubeToEquirectMaterial: Source can only be cube textures.");let n=e.images[0],s=this._renderer,i=this._quad;t===null&&(t=4*n.height),r===null&&(r=2*n.height);let c=new Tl(t,r,{type:pl,colorSpace:n.colorSpace}),l=n.height,m=Math.log2(l)-2,f=1/l,u=1/(3*Math.max(Math.pow(2,m),7*16));i.material.defines.CUBEUV_MAX_MIP=`${m}.0`,i.material.defines.CUBEUV_TEXEL_WIDTH=u,i.material.defines.CUBEUV_TEXEL_HEIGHT=f,i.material.uniforms.envMap.value=e,i.material.uniforms.flipEnvMap.value=e.isRenderTargetTexture?1:-1,i.material.needsUpdate=!0;let a=s.getRenderTarget(),h=s.autoClear;s.autoClear=!0,s.setRenderTarget(c),i.render(s),s.setRenderTarget(a),s.autoClear=h;let g=new Uint16Array(t*r*4),y=new Float32Array(t*r*4);s.readRenderTargetPixels(c,0,0,t,r,y),c.dispose();for(let b=0,p=y.length;b<p;b++)g[b]=dl.toHalfFloat(y[b]);let d=new ml(g,t,r,yl,gl);return d.minFilter=xl,d.magFilter=vl,d.wrapS=Jn,d.wrapT=Jn,d.mapping=hl,d.needsUpdate=!0,d}dispose(){this._quad.dispose()}};function Fl(o){return o.extensions.get("EXT_float_blend")}var Ke=new rs,ts=class{get multipleImportanceSampling(){return!!this._pathTracer.material.defines.FEATURE_MIS}set multipleImportanceSampling(e){this._pathTracer.material.setDefine("FEATURE_MIS",e?1:0)}get transmissiveBounces(){return this._pathTracer.material.transmissiveBounces}set transmissiveBounces(e){this._pathTracer.material.transmissiveBounces=e}get bounces(){return this._pathTracer.material.bounces}set bounces(e){this._pathTracer.material.bounces=e}get filterGlossyFactor(){return this._pathTracer.material.filterGlossyFactor}set filterGlossyFactor(e){this._pathTracer.material.filterGlossyFactor=e}get samples(){return this._pathTracer.samples}get target(){return this._pathTracer.target}get tiles(){return this._pathTracer.tiles}get stableNoise(){return this._pathTracer.stableNoise}set stableNoise(e){this._pathTracer.stableNoise=e}get isCompiling(){return!!this._pathTracer.isCompiling}constructor(e){this._renderer=e,this._generator=new qe,this._pathTracer=new yt(e),this._queueReset=!1,this._clock=new Il,this._compilePromise=null,this._lowResPathTracer=new yt(e),this._lowResPathTracer.tiles.set(1,1),this._quad=new Pl(new Dr({map:null,transparent:!0,blending:es,premultipliedAlpha:e.getContextAttributes().premultipliedAlpha})),this._materials=null,this._previousEnvironment=null,this._previousBackground=null,this._internalBackground=null,this.renderDelay=100,this.minSamples=5,this.fadeDuration=500,this.enablePathTracing=!0,this.pausePathTracing=!1,this.dynamicLowRes=!1,this.lowResScale=.25,this.renderScale=1,this.synchronizeRenderSize=!0,this.rasterizeScene=!0,this.renderToCanvas=!0,this.textureSize=new rs(1024,1024),this.rasterizeSceneCallback=(t,r)=>{this._renderer.render(t,r)},this.renderToCanvasCallback=(t,r,n)=>{let s=r.autoClear;r.autoClear=!1,n.render(r),r.autoClear=s},this.setScene(new _l,new Sl)}setBVHWorker(e){this._generator.setBVHWorker(e)}setScene(e,t,r={}){e.updateMatrixWorld(!0),t.updateMatrixWorld();let n=this._generator;if(n.setObjects(e),this._buildAsync)return n.generateAsync(r.onProgress).then(s=>this._updateFromResults(e,t,s));{let s=n.generate();return this._updateFromResults(e,t,s)}}setSceneAsync(...e){this._buildAsync=!0;let t=this.setScene(...e);return this._buildAsync=!1,t}setCamera(e){this.camera=e,this.updateCamera()}updateCamera(){let e=this.camera;e.updateMatrixWorld(),this._pathTracer.setCamera(e),this._lowResPathTracer.setCamera(e),this.reset()}updateMaterials(){let e=this._pathTracer.material,t=this._renderer,r=this._materials,n=this.textureSize,s=sn(r);e.textures.setTextures(t,s,n.x,n.y),e.materials.updateFrom(r,s),this.reset()}updateLights(){let e=this.scene,t=this._renderer,r=this._pathTracer.material,n=an(e),s=nn(n);r.lights.updateFrom(n,s),r.iesProfiles.setTextures(t,s),this.reset()}updateEnvironment(){let e=this.scene,t=this._pathTracer.material;if(this._internalBackground&&(this._internalBackground.dispose(),this._internalBackground=null),t.backgroundBlur=e.backgroundBlurriness,t.backgroundIntensity=e.backgroundIntensity??1,t.backgroundRotation.makeRotationFromEuler(e.backgroundRotation).invert(),e.background===null)t.backgroundMap=null,t.backgroundAlpha=0;else if(e.background.isColor){this._colorBackground=this._colorBackground||new Mr(16);let r=this._colorBackground;r.topColor.equals(e.background)||(r.topColor.set(e.background),r.bottomColor.set(e.background),r.update()),t.backgroundMap=r,t.backgroundAlpha=1}else if(e.background.isCubeTexture){if(e.background!==this._previousBackground){let r=new bt(this._renderer).generate(e.background);this._internalBackground=r,t.backgroundMap=r,t.backgroundAlpha=1}}else t.backgroundMap=e.background,t.backgroundAlpha=1;if(t.environmentIntensity=e.environment!==null?e.environmentIntensity??1:0,t.environmentRotation.makeRotationFromEuler(e.environmentRotation).invert(),this._previousEnvironment!==e.environment&&e.environment!==null)if(e.environment.isCubeTexture){let r=new bt(this._renderer).generate(e.environment);t.envMapInfo.updateFrom(r)}else t.envMapInfo.updateFrom(e.environment);this._previousEnvironment=e.environment,this._previousBackground=e.background,this.reset()}_updateFromResults(e,t,r){let{materials:n,geometry:s,bvh:i,bvhChanged:c,needsMaterialIndexUpdate:l}=r;this._materials=n;let f=this._pathTracer.material;return c&&(f.bvh.updateFrom(i),f.attributesArray.updateFrom(s.attributes.normal,s.attributes.tangent,s.attributes.uv,s.attributes.color)),l&&f.materialIndexAttribute.updateFrom(s.attributes.materialIndex),this._previousScene=e,this.scene=e,this.camera=t,this.updateCamera(),this.updateMaterials(),this.updateEnvironment(),this.updateLights(),r}renderSample(){let e=this._lowResPathTracer,t=this._pathTracer,r=this._renderer,n=this._clock,s=this._quad;this._updateScale(),this._queueReset&&(t.reset(),e.reset(),this._queueReset=!1,s.material.opacity=0,n.start());let i=n.getDelta()*1e3,c=n.getElapsedTime()*1e3;if(!this.pausePathTracing&&this.enablePathTracing&&this.renderDelay<=c&&!this.isCompiling&&t.update(),t.alpha=t.material.backgroundAlpha!==1||!Fl(r),e.alpha=t.alpha,this.renderToCanvas){let l=this._renderer,m=this.minSamples;if(c>=this.renderDelay&&this.samples>=this.minSamples&&(this.fadeDuration!==0?s.material.opacity=Math.min(s.material.opacity+i/this.fadeDuration,1):s.material.opacity=1),!this.enablePathTracing||this.samples<m||s.material.opacity<1){if(this.dynamicLowRes&&!this.isCompiling){e.samples<1&&(e.material=t.material,e.update());let f=s.material.opacity;s.material.opacity=1-s.material.opacity,s.material.map=e.target.texture,s.render(l),s.material.opacity=f}(!this.dynamicLowRes&&this.rasterizeScene||this.dynamicLowRes&&this.isCompiling)&&this.rasterizeSceneCallback(this.scene,this.camera)}this.enablePathTracing&&s.material.opacity>0&&(s.material.opacity<1&&(s.material.blending=this.dynamicLowRes?Rl:Al),s.material.map=t.target.texture,this.renderToCanvasCallback(t.target,l,s),s.material.blending=es)}}reset(){this._queueReset=!0,this._pathTracer.samples=0}dispose(){this._quad.dispose(),this._quad.material.dispose(),this._pathTracer.dispose()}_updateScale(){if(this.synchronizeRenderSize){this._renderer.getDrawingBufferSize(Ke);let e=Math.floor(this.renderScale*Ke.x),t=Math.floor(this.renderScale*Ke.y);if(this._pathTracer.getSize(Ke),Ke.x!==e||Ke.y!==t){let r=this.lowResScale;this._pathTracer.setSize(e,t),this._lowResPathTracer.setSize(Math.floor(e*r),Math.floor(t*r))}}}};import{Camera as Ml}from"three";var is=class extends Ml{constructor(){super(),this.isEquirectCamera=!0}};import{SpotLight as Dl}from"three";var os=class extends Dl{constructor(...e){super(...e),this.iesMap=null,this.radius=0}copy(e,t){return super.copy(e,t),this.iesMap=e.iesMap,this.radius=e.radius,this}};import{RectAreaLight as Cl}from"three";var ns=class extends Cl{constructor(...e){super(...e),this.isCircular=!1}copy(e,t){return super.copy(e,t),this.isCircular=e.isCircular,this}};import{WebGLRenderTarget as El,RGBAFormat as ss,HalfFloatType as Bl,PMREMGenerator as Nl,DataTexture as Ll,EquirectangularReflectionMapping as Ol,FloatType as zl,DataUtils as kl}from"three";import{FullScreenQuad as Hl}from"three/examples/jsm/postprocessing/Pass.js";var Ri=class extends Q{constructor(){super({uniforms:{envMap:{value:null},blur:{value:0}},vertexShader:`

				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}

			`,fragmentShader:`

				#include <common>
				#include <cube_uv_reflection_fragment>

				${je}

				uniform sampler2D envMap;
				uniform float blur;
				varying vec2 vUv;
				void main() {

					vec3 rayDirection = equirectUvToDirection( vUv );
					gl_FragColor = textureCubeUV( envMap, rayDirection, blur );

				}

			`})}},as=class{constructor(e){this.renderer=e,this.pmremGenerator=new Nl(e),this.copyQuad=new Hl(new Ri),this.renderTarget=new El(1,1,{type:zl,format:ss})}dispose(){this.pmremGenerator.dispose(),this.copyQuad.dispose(),this.renderTarget.dispose()}generate(e,t){let{pmremGenerator:r,renderTarget:n,copyQuad:s,renderer:i}=this,c=r.fromEquirectangular(e),{width:l,height:m}=e.image;n.setSize(l,m),s.material.envMap=c.texture,s.material.blur=t;let f=i.getRenderTarget(),u=i.autoClear;i.setRenderTarget(n),i.autoClear=!0,s.render(i),i.setRenderTarget(f),i.autoClear=u;let a=new Uint16Array(l*m*4),h=new Float32Array(l*m*4);i.readRenderTargetPixels(n,0,0,l,m,h);for(let y=0,d=h.length;y<d;y++)a[y]=kl.toHalfFloat(h[y]);let g=new Ll(a,l,m,ss,Bl);return g.minFilter=e.minFilter,g.magFilter=e.magFilter,g.wrapS=e.wrapS,g.wrapT=e.wrapT,g.mapping=Ol,g.needsUpdate=!0,c.dispose(),g}};import{NoBlending as Ul}from"three";var cs=class extends Q{constructor(e){super({blending:Ul,transparent:!1,depthWrite:!1,depthTest:!1,defines:{USE_SLIDER:0},uniforms:{sigma:{value:5},threshold:{value:.03},kSigma:{value:1},map:{value:null},opacity:{value:1}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}

			`,fragmentShader:`

				//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
				//  Copyright (c) 2018-2019 Michele Morrone
				//  All rights reserved.
				//
				//  https://michelemorrone.eu - https://BrutPitt.com
				//
				//  me@michelemorrone.eu - brutpitt@gmail.com
				//  twitter: @BrutPitt - github: BrutPitt
				//
				//  https://github.com/BrutPitt/glslSmartDeNoise/
				//
				//  This software is distributed under the terms of the BSD 2-Clause license
				//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

				uniform sampler2D map;

				uniform float sigma;
				uniform float threshold;
				uniform float kSigma;
				uniform float opacity;

				varying vec2 vUv;

				#define INV_SQRT_OF_2PI 0.39894228040143267793994605993439
				#define INV_PI 0.31830988618379067153776752674503

				// Parameters:
				//	 sampler2D tex	 - sampler image / texture
				//	 vec2 uv		   - actual fragment coord
				//	 float sigma  >  0 - sigma Standard Deviation
				//	 float kSigma >= 0 - sigma coefficient
				//		 kSigma * sigma  -->  radius of the circular kernel
				//	 float threshold   - edge sharpening threshold
				vec4 smartDeNoise( sampler2D tex, vec2 uv, float sigma, float kSigma, float threshold ) {

					float radius = round( kSigma * sigma );
					float radQ = radius * radius;

					float invSigmaQx2 = 0.5 / ( sigma * sigma );
					float invSigmaQx2PI = INV_PI * invSigmaQx2;

					float invThresholdSqx2 = 0.5 / ( threshold * threshold );
					float invThresholdSqrt2PI = INV_SQRT_OF_2PI / threshold;

					vec4 centrPx = texture2D( tex, uv );
					centrPx.rgb *= centrPx.a;

					float zBuff = 0.0;
					vec4 aBuff = vec4( 0.0 );
					vec2 size = vec2( textureSize( tex, 0 ) );

					vec2 d;
					for ( d.x = - radius; d.x <= radius; d.x ++ ) {

						float pt = sqrt( radQ - d.x * d.x );

						for ( d.y = - pt; d.y <= pt; d.y ++ ) {

							float blurFactor = exp( - dot( d, d ) * invSigmaQx2 ) * invSigmaQx2PI;

							vec4 walkPx = texture2D( tex, uv + d / size );
							walkPx.rgb *= walkPx.a;

							vec4 dC = walkPx - centrPx;
							float deltaFactor = exp( - dot( dC.rgba, dC.rgba ) * invThresholdSqx2 ) * invThresholdSqrt2PI * blurFactor;

							zBuff += deltaFactor;
							aBuff += deltaFactor * walkPx;

						}

					}

					return aBuff / zBuff;

				}

				void main() {

					gl_FragColor = smartDeNoise( map, vec2( vUv.x, vUv.y ), sigma, kSigma, threshold );
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
					#include <premultiplied_alpha_fragment>

					gl_FragColor.a *= opacity;

				}

			`}),this.setValues(e)}};import{Color as Vl,MeshStandardMaterial as Wl}from"three";var ls=class extends Wl{constructor(e){super(e),this.isFogVolumeMaterial=!0,this.density=.015,this.emissive=new Vl,this.emissiveIntensity=0,this.opacity=.15,this.transparent=!0,this.roughness=1,this.metalness=0,this.setValues(e)}};export{as as BlurredEnvMapGenerator,cs as DenoiseMaterial,Yo as DynamicPathTracingSceneGenerator,is as EquirectCamera,ls as FogVolumeMaterial,Mr as GradientEquirectTexture,yt as PathTracingRenderer,qe as PathTracingSceneGenerator,$o as PathTracingSceneWorker,ur as PhysicalCamera,Ar as PhysicalPathTracingMaterial,os as PhysicalSpotLight,Fr as ProceduralEquirectTexture,ns as ShapedAreaLight,ts as WebGLPathTracer};
