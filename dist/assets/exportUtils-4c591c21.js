import{E as f}from"./jspdf.es.min-d7e1879b.js";import"./jspdf.plugin.autotable-7f923d72.js";import{u as i,w as x}from"./xlsx-b055c42d.js";import{P as E}from"./papaparse.min-ed906dfb.js";import{F as y}from"./FileSaver.min-009515ec.js";import"./html2canvas.esm-e0a7d97b.js";const l=(o,e)=>new Blob([o],{type:e}),a=(o,e)=>y.saveAs(o,e),T=(o,e,r)=>{try{const t=new f;if(t.setFontSize(16),t.text(o||"Exported Report",14,20),e&&Array.isArray(e)&&e.length>0){const n=Object.keys(e[0]),s=e.map(p=>n.map(u=>{const c=p[u];return c==null?"":typeof c=="object"?JSON.stringify(c):String(c)}));t.autoTable({startY:30,head:[n],body:s,theme:"grid",headStyles:{fillColor:[15,23,42]}})}else t.setFontSize(12),t.text("No data available for this report.",14,30);return t.save(`${r||"export"}.pdf`),!0}catch(t){return console.error("Error exporting to PDF:",t),!1}},m=(o,e)=>{try{if(!o||!Array.isArray(o)||o.length===0)return console.warn("No data provided for CSV export"),!1;const r=E.unparse(o),t=l(r,"text/csv;charset=utf-8;");return a(t,`${e||"export"}.csv`),!0}catch(r){return console.error("Error exporting to CSV:",r),!1}},F=m,v=(o,e)=>{try{if(!o||!Array.isArray(o)||o.length===0)return console.warn("No data provided for Excel export"),!1;const r=i.json_to_sheet(o),t=i.book_new();return i.book_append_sheet(t,r,"Data"),x(t,`${e||"export"}.xlsx`),!0}catch(r){return console.error("Error exporting to Excel:",r),!1}},N=(o,e)=>{try{const r=[];o&&o.contours&&o.contours.forEach(s=>{r.push({type:"Feature",geometry:{type:"LineString",coordinates:s.points||[]},properties:{value:s.value}})});const n=l(JSON.stringify({type:"FeatureCollection",features:r},null,2),"application/geo+json");return a(n,`${e||"export"}.geojson`),!0}catch(r){return console.error("Error exporting to GeoJSON:",r),!1}},C=(o,e)=>{try{let r=`0
SECTION
2
ENTITIES
`;o&&o.contours&&o.contours.forEach(n=>{r+=`0
POLYLINE
8
0
66
1
`,n.points&&n.points.forEach(s=>{r+=`0
VERTEX
8
0
10
${s[0]}
20
${s[1]}
30
0.0
`}),r+=`0
SEQEND
`}),r+=`0
ENDSEC
0
EOF
`;const t=l(r,"application/dxf");return a(t,`${e||"export"}.dxf`),!0}catch(r){return console.error("Error exporting to DXF:",r),!1}},D=(o,e="Document")=>{try{const r=document.getElementById(o);if(!r)return console.warn(`Element with id ${o} not found.`),!1;const t=r.innerHTML,n=document.body.innerHTML;return document.body.innerHTML=t,document.title=e,window.print(),document.body.innerHTML=n,window.location.reload(),!0}catch(r){return console.error("Error printing element:",r),!1}};export{F as a,N as b,C as c,m as d,T as e,v as f,D as p};
