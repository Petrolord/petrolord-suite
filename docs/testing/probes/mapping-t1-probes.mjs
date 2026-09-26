// Mapping & Surface Studio T1 engine probes (2026-09-26). Run from the repo root:
//   node --experimental-specifier-resolution=node docs/testing/probes/mapping-t1-probes.mjs
// Calls the real engine with the workstation options; see docs/testing/MappingSurfaceStudio-T1.md.
const E=new URL("../../../packages/engines", import.meta.url).pathname;
const { gridSurface, fitTps } = await import(E+'/lib/gridding/gridding.js');
const { grvAcreFt } = await import(E+'/lib/gridding/surfaceExport.js');
const { specForPoints, gridObject } = await import(E+'/engines/mapping/surface.js');
const { krigeSurface } = await import(E+'/lib/gridding/kriging.js');
const FT=0.3048;
// Analytic cone dome: crest -1800 m, flank slope 0.1 (z = -1800 - 0.1 r). Contact -1900 m => closure radius 1000 m.
const cone=(x,y)=>-1800-0.1*Math.hypot(x,y);
// 1. Dense control (seismic-like) everywhere out to 1500 m -> GRV should be pi r^2 h/3 = pi*1000^2*100/3
const pts=[]; for(let x=-1500;x<=1500;x+=50) for(let y=-1500;y<=1500;y+=50) pts.push({x,y,z:cone(x,y)});
const spec={x0:-1500,y0:-1500,dx:25,dy:25,nx:121,ny:121};
let t=Date.now(); const g=gridSurface(pts,spec,{maxExtrapolation:1e9}); const tGrid=Date.now()-t;
const zft=g.z.map(v=>Math.abs(v)>1e29?v:v/FT);
const acft=grvAcreFt({z:zft},25,25,-1900/FT); const m3=acft*1233.48183754752;
const exact=Math.PI*1e6*100/3;
console.log('1 dense cone GRV m3',m3.toExponential(4),'exact',exact.toExponential(4),'err%',((m3/exact-1)*100).toFixed(2),'grid ms',tGrid,'controls',g.controlCount,'dropped',g.dropped);
// 2. Five wells: crest well + 4 flank wells at r=600 -> hull is a square of half-diagonal 600 -> closure (r=1000) truncated
const wells=[{x:0,y:0},{x:600,y:0},{x:-600,y:0},{x:0,y:600},{x:0,y:-600}].map(p=>({...p,z:cone(p.x,p.y)}));
const s2=specForPoints(wells,25);
const g2=gridSurface(wells,s2,{maxExtrapolation:1e9});
const live=g2.live, total=s2.nx*s2.ny;
const acft2=grvAcreFt({z:g2.z.map(v=>Math.abs(v)>1e29?v:v/FT)},25,25,-1900/FT);
console.log('2 five wells: grid extent x',s2.x0,'..',s2.x0+(s2.nx-1)*25,'live',live,'of',total,'GRV m3',(acft2*1233.48).toExponential(3),'vs true',exact.toExponential(3),'=',(acft2*1233.48/exact*100).toFixed(1)+'% of true');
// 3. Pilot hole + sidetrack 5 m apart with 3 m different top (real-world) among others
const w3=[...wells,{x:5,y:0,z:cone(0,0)-3}];
try{ const g3=gridSurface(w3,specForPoints(w3,25),{maxExtrapolation:1e9}); let mn=Infinity,mx=-Infinity; for(const v of g3.z) if(Math.abs(v)<1e29){mn=Math.min(mn,v);mx=Math.max(mx,v);} console.log('3 near-duplicate: z range',mn.toFixed(1),mx.toFixed(1),'(true range',cone(600,600).toFixed(1),'..-1800)');}catch(e){console.log('3 near-dup error',e.message)}
// 4. Exact duplicate location
try{ gridSurface([...wells,{x:0,y:0,z:-1805}],specForPoints(wells,25)); console.log('4 exact duplicate: gridded without complaint');}catch(e){console.log('4 exact dup error:',e.message)}
// 5. Two separate highs: GRV counts both
const two=(x,y)=>Math.max(cone(x,y),cone(x-3000,y));
const p5=[]; for(let x=-1500;x<=4500;x+=100) for(let y=-1500;y<=1500;y+=100) p5.push({x,y,z:two(x,y)});
const s5={x0:-1500,y0:-1500,dx:50,dy:50,nx:121,ny:61};
const g5=gridSurface(p5,s5,{maxExtrapolation:1e9});
const a5=grvAcreFt({z:g5.z.map(v=>Math.abs(v)>1e29?v:v/FT)},50,50,-1900/FT)*1233.48;
console.log('5 two separate domes GRV m3',a5.toExponential(3),'= ',(a5/exact).toFixed(2),'x one closure');
// 6. timing: 700 controls on 400x400
const p6=[]; for(let i=0;i<2000;i++){const x=Math.random()*20000,y=Math.random()*20000; p6.push({x,y,z:cone(x-1e4,y-1e4)});}
t=Date.now(); const g6=gridSurface(p6,{x0:0,y0:0,dx:50,dy:50,nx:401,ny:401}); console.log('6 2000 picks -> 401x401 ms',Date.now()-t,'controls used',g6.controlCount,'dropped',g6.dropped);
// 7. kriging on 5 wells
try{ const k=krigeSurface(wells,s2,{}); console.log('7 krige keys',Object.keys(k).join(','));}catch(e){console.log('7 krige err',e.message)}
// 8. Seven-well realistic dome with wells at r in 200..900 (typical appraisal)
const w8=[[0,0],[400,100],[-300,350],[150,-450],[-700,-200],[800,500],[-100,850]].map(([x,y])=>({x,y,z:cone(x,y)}));
const s8=specForPoints(w8,25,2); const g8=gridSurface(w8,s8,{maxExtrapolation:1e9});
const a8=grvAcreFt({z:g8.z.map(v=>Math.abs(v)>1e29?v:v/FT)},25,25,-1900/FT)*1233.48;
let crest=-Infinity; for(const v of g8.z) if(Math.abs(v)<1e29) crest=Math.max(crest,v);
console.log('8 seven appraisal wells: GRV',(a8/1e6).toFixed(1),'Mm3 vs true',(exact/1e6).toFixed(1),'; mapped crest',crest.toFixed(1),'(true -1800); area mapped km2',(g8.live*625/1e6).toFixed(2),'vs closure area',(Math.PI).toFixed(2));
