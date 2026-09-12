import * as THREE from 'three';

/* ======================================================================
   AUDIO – alles synthetisch über die Web Audio API, keine externen Dateien
   ====================================================================== */
const Audio = {
  ctx:null, master:null, noise:null, enabled:true, heli:null,
  init(){
    if(this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = .75;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .12;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate*2, buf = this.ctx.createBuffer(1,len,this.ctx.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    this.noise = buf;
  },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },
  // Räumliche Einordnung: Lautstärke über Distanz, Pan über Kamerarichtung
  out(pos, base=1){
    if(!this.ctx || !this.enabled) return null;
    const g = this.ctx.createGain(); let vol = base, pan = 0;
    if(pos){
      const dx = pos.x-camera.position.x, dz = pos.z-camera.position.z, dist = Math.hypot(dx,dz);
      vol *= Math.pow(Math.max(.04, 1-dist/85), 1.4);
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      pan = Math.max(-1,Math.min(1,(dx*rx+dz*rz)/18));
    }
    g.gain.value = vol;
    if(this.ctx.createStereoPanner){ const p=this.ctx.createStereoPanner(); p.pan.value=pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  },
  burst(dest,{dur=.1,type='bandpass',freq=1000,q=1,gain=1,f2=null,delay=0}){
    const t=this.ctx.currentTime+delay, s=this.ctx.createBufferSource(); s.buffer=this.noise; s.loop=true;
    const f=this.ctx.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t); f.Q.value=q;
    if(f2!==null) f.frequency.exponentialRampToValueAtTime(f2,t+dur);
    const g=this.ctx.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t+dur+.02);
  },
  tone(dest,{dur=.1,f=200,f2=null,type='sine',gain=.5,delay=0}){
    const t=this.ctx.currentTime+delay, o=this.ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t);
    if(f2!==null) o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    const g=this.ctx.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur+.02);
  },
  shot(kind,pos){
    const d=this.out(pos, kind==='sniper'?1.1:kind==='shotgun'?1.05:.8); if(!d) return;
    if(kind==='ak'){ this.burst(d,{dur:.09,freq:1400,q:.7,gain:.9,f2:300}); this.tone(d,{dur:.08,f:150,f2:45,gain:.6}); this.burst(d,{dur:.02,type:'highpass',freq:4000,gain:.5}); }
    else if(kind==='shotgun'){ this.burst(d,{dur:.28,type:'lowpass',freq:1600,q:.5,gain:1.1,f2:200}); this.tone(d,{dur:.22,f:110,f2:32,gain:.8}); this.burst(d,{dur:.04,type:'highpass',freq:3000,gain:.6}); }
    else { this.burst(d,{dur:.05,type:'highpass',freq:2500,gain:1}); this.burst(d,{dur:.6,type:'lowpass',freq:900,q:.4,gain:.7,f2:120,delay:.02}); this.tone(d,{dur:.3,f:200,f2:38,gain:.7}); }
  },
  hit(kill){ const d=this.out(null,.5); if(!d) return; if(kill){ this.tone(d,{dur:.09,f:520,type:'square',gain:.18}); this.tone(d,{dur:.16,f:780,f2:1040,type:'square',gain:.18,delay:.07}); } else this.tone(d,{dur:.045,f:1900,type:'triangle',gain:.35}); },
  hurt(){ const d=this.out(null,.7); if(!d) return; this.burst(d,{dur:.16,type:'lowpass',freq:420,gain:.8}); this.tone(d,{dur:.14,f:90,f2:40,gain:.5}); },
  click(){ const d=this.out(null,.5); if(!d) return; this.burst(d,{dur:.015,type:'highpass',freq:2500,gain:.7}); this.tone(d,{dur:.04,f:320,gain:.25}); },
  reload(){ const d=this.out(null,.6); if(!d) return; this.burst(d,{dur:.03,type:'bandpass',freq:1800,q:2,gain:.6}); this.burst(d,{dur:.04,type:'bandpass',freq:900,q:2,gain:.7,delay:.55}); this.burst(d,{dur:.03,type:'highpass',freq:3000,gain:.5,delay:1.0}); },
  step(){ const d=this.out(null,.18); if(!d) return; this.burst(d,{dur:.05,type:'lowpass',freq:500,gain:.8}); },
  explosion(pos,big=false){ const d=this.out(pos, big?1.4:1.1); if(!d) return; this.burst(d,{dur:big?2.6:1.1,type:'lowpass',freq:big?900:600,q:.3,gain:1.2,f2:40}); this.tone(d,{dur:big?1.8:.7,f:70,f2:22,gain:1}); this.burst(d,{dur:.08,type:'highpass',freq:2000,gain:.6}); },
  siren(){ const d=this.out(null,.35); if(!d) return; for(let i=0;i<3;i++){ this.tone(d,{dur:1.2,f:380,f2:760,type:'sawtooth',gain:.12,delay:i*1.25}); } },
  heliStart(){
    if(!this.ctx||!this.enabled||this.heli) return;
    const t=this.ctx.currentTime, s=this.ctx.createBufferSource(); s.buffer=this.noise; s.loop=true;
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=260; f.Q.value=1.2;
    const g=this.ctx.createGain(); g.gain.value=0; g.gain.linearRampToValueAtTime(.55,t+1.5);
    const lfo=this.ctx.createOscillator(); lfo.type='square'; lfo.frequency.value=17;
    const lg=this.ctx.createGain(); lg.gain.value=.5; lfo.connect(lg); lg.connect(g.gain);
    const sub=this.ctx.createOscillator(); sub.type='triangle'; sub.frequency.value=42; const sg=this.ctx.createGain(); sg.gain.value=.25;
    sub.connect(sg); sg.connect(g);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); lfo.start(t); sub.start(t);
    this.heli={s,lfo,sub,g};
  },
  heliStop(){ if(!this.heli) return; const t=this.ctx.currentTime, h=this.heli; h.g.gain.linearRampToValueAtTime(0,t+1.2); h.s.stop(t+1.3); h.lfo.stop(t+1.3); h.sub.stop(t+1.3); this.heli=null; }
};

/* ======================================================================
   RENDERER, SZENE, LICHT
   ====================================================================== */
const isTouch = matchMedia('(pointer: coarse)').matches;
const quality = { high:{px:2,shadow:2048,shadowOn:true}, medium:{px:1.5,shadow:1536,shadowOn:true}, low:{px:1,shadow:1024,shadowOn:false} };
let Q = quality.medium;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color(0x5f8fc9), SKY_HOR = new THREE.Color(0xd9c9a4);
scene.fog = new THREE.Fog(0xc9bda0, 50, 170);
const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, .1, 400);

const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4b4a2c, 1.4); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 3.5); sun.position.set(40,70,25); sun.castShadow = true;
// Rim-Light für bessere Tiefe
const rimLight = new THREE.DirectionalLight(0xffe8c0, .8); rimLight.position.set(-30,40,-20); scene.add(rimLight);
// Umgebungslicht für weichere Schatten
const ambFill = new THREE.AmbientLight(0x1a1e2a, .3); scene.add(ambFill);
sun.shadow.camera.left=-70; sun.shadow.camera.right=70; sun.shadow.camera.top=70; sun.shadow.camera.bottom=-70;
sun.shadow.camera.near=10; sun.shadow.camera.far=200; sun.shadow.bias=-.0006; sun.shadow.normalBias=.03;
scene.add(sun); scene.add(sun.target);

// Himmelskuppel mit Verlauf
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite:false, fog:false,
  uniforms:{ top:{value:SKY_TOP}, hor:{value:SKY_HOR}, sunDir:{value:sun.position.clone().normalize()} },
  vertexShader:`varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader:`uniform vec3 top,hor,sunDir; varying vec3 vP; void main(){ float h=clamp(vP.y,0.,1.); vec3 c=mix(hor,top,pow(h,.45)); float s=pow(max(dot(vP,sunDir),0.),240.)*1.4 + pow(max(dot(vP,sunDir),0.),8.)*.2; c+=vec3(1.,.95,.82)*s; float haze=pow(1.-h,.8)*.12; c+=vec3(.85,.78,.6)*haze; gl_FragColor=vec4(c,1.); }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320,32,16), skyMat));

/* ======================================================================
   PROZEDURALE TEXTUREN (Canvas), damit die Datei ohne Assets auskommt
   ====================================================================== */
function makeTex(size, draw, repeat=1){
  const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); draw(g,size);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat,repeat); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy()); return t;
}
function grain(g,s,n,alpha,dark=true){ for(let i=0;i<n;i++){ const v=Math.random()*40|0; g.fillStyle=`rgba(${dark?0:255},${dark?0:255},${dark?0:255},${alpha*Math.random()})`; g.fillRect(Math.random()*s,Math.random()*s,1+Math.random()*3,1+Math.random()*3);} }
const texGround = makeTex(512,(g,s)=>{
  g.fillStyle='#5f5d3c'; g.fillRect(0,0,s,s);
  for(let i=0;i<500;i++){ g.fillStyle=`hsla(${58+Math.random()*22},${18+Math.random()*16}%,${26+Math.random()*12}%,.6)`; g.beginPath(); g.ellipse(Math.random()*s,Math.random()*s,10+Math.random()*40,6+Math.random()*20,Math.random()*6,0,7); g.fill(); }
  for(let i=0;i<220;i++){ g.fillStyle=`rgba(105,88,60,${.2+Math.random()*.3})`; g.beginPath(); g.ellipse(Math.random()*s,Math.random()*s,8+Math.random()*36,5+Math.random()*12,Math.random()*6,0,7); g.fill(); }
  for(let i=0;i<160;i++){ g.fillStyle=`rgba(120,125,80,${.15+Math.random()*.2})`; g.beginPath(); g.ellipse(Math.random()*s,Math.random()*s,2+Math.random()*5,1+Math.random()*3,Math.random()*6,0,7); g.fill(); }
  grain(g,s,3500,.22);
},14);
const texConcrete = makeTex(256,(g,s)=>{
  g.fillStyle='#8c8a82'; g.fillRect(0,0,s,s); grain(g,s,5000,.28); grain(g,s,2500,.18,false);
  g.strokeStyle='rgba(40,40,35,.35)'; g.lineWidth=1; for(let i=0;i<6;i++){ g.beginPath(); let x=Math.random()*s,y=Math.random()*s; g.moveTo(x,y); for(let k=0;k<6;k++){ x+=(Math.random()-.5)*60; y+=(Math.random()-.5)*60; g.lineTo(x,y);} g.stroke(); }
  g.strokeStyle='rgba(30,30,28,.5)'; g.lineWidth=3; g.strokeRect(2,2,s-4,s-4);
},1);
const texMetal = makeTex(256,(g,s)=>{
  g.fillStyle='#b7bec2'; g.fillRect(0,0,s,s);
  for(let x=0;x<s;x+=16){ g.fillStyle='rgba(0,0,0,.28)'; g.fillRect(x,0,6,s); g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(x+9,0,3,s); }
  grain(g,s,2500,.3); for(let i=0;i<40;i++){ g.fillStyle=`rgba(120,70,40,${Math.random()*.5})`; g.fillRect(Math.random()*s,Math.random()*s,2+Math.random()*10,2+Math.random()*6); }
},1);
const texWood = makeTex(256,(g,s)=>{
  g.fillStyle='#8a6a3c'; g.fillRect(0,0,s,s);
  for(let y=0;y<s;y+=42){ g.fillStyle=`hsl(${28+Math.random()*8},${35+Math.random()*10}%,${32+Math.random()*10}%)`; g.fillRect(0,y,s,40); g.fillStyle='rgba(0,0,0,.45)'; g.fillRect(0,y+40,s,2); for(let i=0;i<6;i++){ g.strokeStyle='rgba(60,35,10,.35)'; g.beginPath(); g.moveTo(0,y+Math.random()*40); g.bezierCurveTo(s*.3,y+Math.random()*40,s*.6,y+Math.random()*40,s,y+Math.random()*40); g.stroke(); } }
  g.strokeStyle='rgba(20,10,0,.6)'; g.lineWidth=6; g.strokeRect(0,0,s,s); g.beginPath(); g.moveTo(0,0); g.lineTo(s,s); g.moveTo(s,0); g.lineTo(0,s); g.stroke();
},1);
const texSand = makeTex(256,(g,s)=>{ g.fillStyle='#a58f5c'; g.fillRect(0,0,s,s); grain(g,s,7000,.3); grain(g,s,3000,.2,false); for(let y=0;y<s;y+=32){ g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,y,s,4); g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(0,y+12,s,6);} },1);
const texWall = makeTex(256,(g,s)=>{ g.fillStyle='#5d5a52'; g.fillRect(0,0,s,s); grain(g,s,5000,.3); g.fillStyle='#d1b13a'; g.fillRect(0,s*.42,s,s*.16); g.fillStyle='#1d1c18'; for(let x=0;x<s;x+=48) g.fillRect(x,s*.42,24,s*.16); grain(g,s,1500,.25); },1);

/* ======================================================================
   KARTE
   ====================================================================== */
const ARENA = 110, HALF = ARENA/2;
const obstacles = [];
const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA+40,ARENA+40), new THREE.MeshStandardMaterial({map:texGround, roughness:.95, metalness:0}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

function box(x,z,w,h,d,mat,rotY=0,y=null){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y===null?h/2:y,z); m.rotation.y=rotY; m.castShadow=true; m.receiveShadow=true; scene.add(m); return m;
}
const matConcrete=new THREE.MeshStandardMaterial({map:texConcrete,roughness:.9});
const matWall=new THREE.MeshStandardMaterial({map:texWall,roughness:.85});
const matWood=new THREE.MeshStandardMaterial({map:texWood,roughness:.8});
const matSand=new THREE.MeshStandardMaterial({map:texSand,roughness:1});
const matMetalA=new THREE.MeshStandardMaterial({map:texMetal,roughness:.55,metalness:.45,color:0x3f6a7a});
const matMetalB=new THREE.MeshStandardMaterial({map:texMetal,roughness:.55,metalness:.45,color:0xd08a3a});
const matMetalC=new THREE.MeshStandardMaterial({map:texMetal,roughness:.55,metalness:.45,color:0x8a9a5a});
const matBarrel=new THREE.MeshStandardMaterial({color:0x5a6a3a,roughness:.6,metalness:.4});

function solid(x,z,w,h,d){ obstacles.push({x,z,w,h,d}); }
function container(x,z,rot,mat){ const w=rot?6:14,d=rot?14:6; box(x,z,w,5.2,d,mat); solid(x,z,w,5.2,d); const rib=new THREE.Mesh(new THREE.BoxGeometry(rot?6.2:14.2,.3,rot?14.2:6.2),new THREE.MeshStandardMaterial({color:0x22262a,roughness:.7})); rib.position.set(x,5.25,z); scene.add(rib); }
function crateStack(x,z){ box(x,z,3,3,3,matWood); box(x+3.1,z,3,3,3,matWood,.05); box(x+1.5,z+.1,3,3,3,matWood,.02,4.5); solid(x+1.5,z,6.2,6,3.2); }
function sandbags(x,z,len,rot){ const w=rot?1.6:len,d=rot?len:1.6; const m=box(x,z,w,1.5,d,matSand); m.geometry=new THREE.BoxGeometry(w,1.5,d,1,1,1); solid(x,z,w,1.5,d); }
function barrel(x,z){ const m=new THREE.Mesh(new THREE.CylinderGeometry(.75,.75,2.2,14),matBarrel); m.position.set(x,1.1,z); m.castShadow=m.receiveShadow=true; scene.add(m); solid(x,z,1.5,2.2,1.5); }
function bunker(x,z,w,h,d){ box(x,z,w,h,d,matConcrete); solid(x,z,w,h,d); }

// Außenmauern
box(0,-HALF,ARENA+4,7,2,matWall); solid(0,-HALF,ARENA+4,7,2);
box(0, HALF,ARENA+4,7,2,matWall); solid(0, HALF,ARENA+4,7,2);
box(-HALF,0,2,7,ARENA+4,matWall); solid(-HALF,0,2,7,ARENA+4);
box( HALF,0,2,7,ARENA+4,matWall); solid( HALF,0,2,7,ARENA+4);
// Ecktürme
[[-HALF+1,-HALF+1],[HALF-1,-HALF+1],[-HALF+1,HALF-1],[HALF-1,HALF-1]].forEach(([x,z])=>{ box(x,z,5,11,5,matConcrete); });

// Innenraum – Deckung in Symmetrie
bunker(0,-6,10,3.2,22);
bunker(0,30,20,4,4);   bunker(0,-30,20,4,4);
container(-26,-20,false,matMetalA); container(26,20,false,matMetalB);
container(24,-22,true,matMetalC); container(-24,22,true,matMetalA);
bunker(-40,4,7,8,7); bunker(40,-4,7,8,7);
crateStack(12,4); crateStack(-15,-6);
sandbags(-8,18,10,false); sandbags(8,-18,10,false);
sandbags(-32,-2,10,true); sandbags(32,2,10,true);
barrel(-20,12); barrel(-21.4,13.2); barrel(20,-12); barrel(21.4,-13.2); barrel(-44,-40); barrel(44,40);
bunker(-14,36,6,2.2,6); bunker(14,-36,6,2.2,6);

// Bodenmarkierungen und Details
const lineMat=new THREE.MeshBasicMaterial({color:0xe8dcb8,transparent:true,opacity:.35});
for(const z of [-40,40]){ const l=new THREE.Mesh(new THREE.PlaneGeometry(60,.5),lineMat); l.rotation.x=-Math.PI/2; l.position.set(0,.02,z); scene.add(l); }
const ring=new THREE.Mesh(new THREE.RingGeometry(9,9.6,48),lineMat); ring.rotation.x=-Math.PI/2; ring.position.y=.02; scene.add(ring);
// Laternenmasten mit Lichtern
const poleMat=new THREE.MeshStandardMaterial({color:0x2a2c2e,roughness:.6,metalness:.6});
for(const [x,z] of [[-30,-42],[30,42],[42,-30],[-42,30]]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.18,.25,12,8),poleMat); p.position.set(x,6,z); p.castShadow=true; scene.add(p); solid(x,z,.6,12,.6); const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.4,.4,.8),new THREE.MeshStandardMaterial({color:0xfff3c0,emissive:0xffe08a,emissiveIntensity:1.4})); lamp.position.set(x,12,z); scene.add(lamp); }

function blocked(x,z,r){
  if(x<-HALF+2.2||x>HALF-2.2||z<-HALF+2.2||z>HALF-2.2) return true;
  for(const o of obstacles){ if(x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r) return true; }
  return false;
}
// Sichtlinie (2D) – Strecke gegen Hindernis-Rechtecke
function segHitsBox(ax,az,bx,bz,o){
  const minx=o.x-o.w/2,maxx=o.x+o.w/2,minz=o.z-o.d/2,maxz=o.z+o.d/2; let t0=0,t1=1; const dx=bx-ax,dz=bz-az;
  const clip=(p,q)=>{ if(p===0) return q>=0; const r=q/p; if(p<0){ if(r>t1) return false; if(r>t0) t0=r; } else { if(r<t0) return false; if(r<t1) t1=r; } return true; };
  return clip(-dx,ax-minx)&&clip(dx,maxx-ax)&&clip(-dz,az-minz)&&clip(dz,maxz-az);
}
function hasLOS(ax,az,bx,bz){ for(const o of obstacles){ if(o.h<1.6) continue; if(segHitsBox(ax,az,bx,bz,o)) return false; } return true; }

/* ======================================================================
   FIGUREN
   ====================================================================== */
const skinMat=new THREE.MeshStandardMaterial({color:0xd9a074,roughness:.8});
const gunMat=new THREE.MeshStandardMaterial({color:0x1c1c1c,roughness:.5,metalness:.6});
const teamMats={ blue:new THREE.MeshStandardMaterial({color:0x3d6db8,roughness:.75}), red:new THREE.MeshStandardMaterial({color:0xb33a2a,roughness:.75}) };
const uniformMats={ blue:new THREE.MeshStandardMaterial({color:0x4a5a46,roughness:.9}), red:new THREE.MeshStandardMaterial({color:0x5c4e3c,roughness:.9}) };
const helmetMat=new THREE.MeshStandardMaterial({color:0x353b2e,roughness:.7});
const G={ torso:new THREE.BoxGeometry(1.1,1.25,.6), vest:new THREE.BoxGeometry(1.2,.85,.7), leg:new THREE.BoxGeometry(.4,1.0,.45), arm:new THREE.BoxGeometry(.32,.9,.32), head:new THREE.SphereGeometry(.36,14,12), helmet:new THREE.SphereGeometry(.42,14,8,0,Math.PI*2,0,Math.PI/2), gun:new THREE.BoxGeometry(.18,.22,1.3), mag:new THREE.BoxGeometry(.14,.4,.22) };
function makeCharacter(team,isPlayer=false){
  const g=new THREE.Group(); const uni=uniformMats[team];
  const mk=(geo,mat,x,y,z)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; g.add(m); return m; };
  const legL=mk(G.leg,uni,-.28,1.0,0), legR=mk(G.leg,uni,.28,1.0,0); legL.geometry=legR.geometry=G.leg; legL.position.y=legR.position.y=1.0;
  // Drehpunkt an der Hüfte
  const hipL=new THREE.Group(); hipL.position.set(-.28,1.5,0); legL.position.set(0,-.5,0); hipL.add(legL); g.add(hipL);
  const hipR=new THREE.Group(); hipR.position.set(.28,1.5,0); legR.position.set(0,-.5,0); hipR.add(legR); g.add(hipR);
  mk(G.torso,uni,0,2.1,0); const vest=mk(G.vest,teamMats[team],0,2.05,0);
  if(isPlayer) vest.material=new THREE.MeshStandardMaterial({color:0x5a8fe0,roughness:.6,emissive:0x1a3a80,emissiveIntensity:.35});
  const head=mk(G.head,skinMat,0,3.1,0); mk(G.helmet,helmetMat,0,3.12,0);
  const armL=new THREE.Group(); armL.position.set(-.7,2.6,0); const aL=mk(G.arm,uni,0,0,0); aL.position.set(0,-.35,.25); aL.rotation.x=-1.2; armL.add(aL); g.add(armL);
  const armR=new THREE.Group(); armR.position.set(.7,2.6,0); const aR=mk(G.arm,uni,0,0,0); aR.position.set(0,-.35,.25); aR.rotation.x=-1.2; armR.add(aR); g.add(armR);
  const gun=mk(G.gun,gunMat,.32,2.25,.75); mk(G.mag,gunMat,.32,2.05,.6);
  g.userData={hipL,hipR,armL,armR,gun,walk:0,recoil:0};
  return g;
}
function animateCharacter(g,moving,dt,speedFactor=1){
  const u=g.userData; u.walk+= (moving? dt*11*speedFactor : 0); const a= moving? Math.sin(u.walk)*.7 : 0;
  u.hipL.rotation.x += (a - u.hipL.rotation.x)*Math.min(1,dt*14); u.hipR.rotation.x += (-a - u.hipR.rotation.x)*Math.min(1,dt*14);
  u.recoil=Math.max(0,u.recoil-dt*6); u.gun.position.z=.75-u.recoil*.25;
}

/* ======================================================================
   SPIELZUSTAND, WAFFEN, ENTITÄTEN
   ====================================================================== */
const GOAL=30;
const weapons={
  ak:     {name:'AK-47',   cooldown:.105,damage:12,speed:95, pellets:1,spread:.016,mag:30,reload:1.9,auto:true, range:80,kick:.6,tracer:0xffd27a},
  shotgun:{name:'Shotgun', cooldown:.62, damage:15,speed:70, pellets:8,spread:.11, mag:6, reload:2.3,auto:false,range:26,kick:1.4,tracer:0xffb060},
  sniper: {name:'Sniper',  cooldown:1.25,damage:100,speed:170,pellets:1,spread:.004,mag:5, reload:2.6,auto:false,range:140,kick:1.8,tracer:0xa0e0ff}
};
const state={ phase:'menu', splash:false, assist:true, sens:8, score:{blue:0,red:0}, time:0, shake:0 };
const player={ name:'Du', x:0,z:40, radius:.7, team:'blue', hp:100, alive:true, respawn:0, invincible:0, weapon:'ak', shootTimer:0, mag:30, reloading:0, kills:0,deaths:0, streak:0,bestStreak:0, lastHit:0, faceYaw:0, stepT:0, mesh:makeCharacter('blue',true) };
scene.add(player.mesh);
const cam={ yaw:0, pitch:.12, dist:9.5 };

const bots=[];
const NAMES={blue:['Falke','Anker','Kolibri','Nordwind','Basalt'], red:['Wespe','Schakal','Kobra','Sandsturm','Granit','Zyklon']};
function teamSpawn(team,i){
  const zs= team==='blue'? 42 : -42; const xs=[-18,-9,0,9,18,-14,14][i%7]; const zo=[0,0,0,0,0,5,5][i%7]*(team==='blue'?-1:1);
  for(let r=0;r<40;r++){ const x=xs+(Math.random()-.5)*r*1.5, z=zs+zo+(Math.random()-.5)*r*1.5; if(!blocked(x,z,.9)) return {x,z}; }
  return {x:xs,z:zs};
}
function createBot(team,i){
  const s=teamSpawn(team,i);
  const b={ name:NAMES[team][i]||team+i, x:s.x,z:s.z, radius:.7, team, spawnIndex:i, hp:100, alive:true, invincible:1.5, respawn:0, shootTimer:Math.random(), burst:0, target:null, targetTimer:Math.random()*.3, path:[],pathIndex:0,pathTimer:0,pathTargetX:0,pathTargetZ:0, strafeDir:1,strafeTimer:0, speed: team==='blue'?5.4:5.8, weapon:'ak', moving:false, faceYaw:0, mesh:makeCharacter(team) };
  b.mesh.position.set(b.x,0,b.z); scene.add(b.mesh); bots.push(b);
}
for(let i=0;i<5;i++) createBot('blue',i);
for(let i=0;i<6;i++) createBot('red',i);

function moveEntity(e,dx,dz){
  if(!blocked(e.x+dx,e.z,e.radius)) e.x+=dx;
  if(!blocked(e.x,e.z+dz,e.radius)) e.z+=dz;
}

/* ======================================================================
   WEGFINDUNG (A*) – für Bots
   ====================================================================== */
const PATH_STEP=2.5, PATH_SIZE=Math.floor(ARENA/PATH_STEP)+1, PATH_RADIUS=1.0;
const grid=[];
for(let z=0;z<PATH_SIZE;z++){ grid[z]=[]; for(let x=0;x<PATH_SIZE;x++){ const wx=(x-(PATH_SIZE-1)/2)*PATH_STEP, wz=(z-(PATH_SIZE-1)/2)*PATH_STEP; grid[z][x]=!blocked(wx,wz,PATH_RADIUS); } }
const toGrid=(x,z)=>({x:Math.max(0,Math.min(PATH_SIZE-1,Math.round(x/PATH_STEP+(PATH_SIZE-1)/2))),z:Math.max(0,Math.min(PATH_SIZE-1,Math.round(z/PATH_STEP+(PATH_SIZE-1)/2)))});
const toWorld=(x,z)=>({x:(x-(PATH_SIZE-1)/2)*PATH_STEP,z:(z-(PATH_SIZE-1)/2)*PATH_STEP});
const walk=(x,z)=> x>=0&&z>=0&&x<PATH_SIZE&&z<PATH_SIZE&&grid[z][x];
function nearestWalkable(n){ if(walk(n.x,n.z)) return n; for(let r=1;r<8;r++){ let best=null,bd=1e9; for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){ if(walk(n.x+dx,n.z+dz)){ const d=dx*dx+dz*dz; if(d<bd){bd=d;best={x:n.x+dx,z:n.z+dz};} } } if(best) return best; } return null; }
const DIRS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
function findPath(sx,sz,tx,tz){
  const s=nearestWalkable(toGrid(sx,sz)), t=nearestWalkable(toGrid(tx,tz)); if(!s||!t) return [];
  const key=(x,z)=>z*PATH_SIZE+x; const open=[], nodes=new Map(), closed=new Set();
  const start={x:s.x,z:s.z,g:0,h:Math.hypot(t.x-s.x,t.z-s.z),p:null}; start.f=start.h; open.push(start); nodes.set(key(s.x,s.z),start);
  let loops=0;
  while(open.length&&loops++<3000){
    let bi=0; for(let i=1;i<open.length;i++) if(open[i].f<open[bi].f) bi=i;
    const c=open.splice(bi,1)[0]; const ck=key(c.x,c.z); closed.add(ck);
    if(c.x===t.x&&c.z===t.z){ const out=[]; let n=c; while(n){ out.push(toWorld(n.x,n.z)); n=n.p; } return out.reverse(); }
    for(const [dx,dz] of DIRS){
      const nx=c.x+dx,nz=c.z+dz; if(!walk(nx,nz)) continue; if(dx&&dz&&!(walk(nx,c.z)&&walk(c.x,nz))) continue;
      const nk=key(nx,nz); if(closed.has(nk)) continue;
      const g=c.g+(dx&&dz?1.414:1); let n=nodes.get(nk);
      if(!n){ n={x:nx,z:nz,g,h:Math.hypot(t.x-nx,t.z-nz),p:c}; n.f=n.g+n.h; nodes.set(nk,n); open.push(n); }
      else if(g<n.g){ n.g=g; n.f=g+n.h; n.p=c; if(!open.includes(n)) open.push(n); }
    }
  }
  return [];
}

/* ======================================================================
   PROJEKTILE, EFFEKTE
   ====================================================================== */
const bullets=[]; const bulletPool=[];
const tracerGeo=new THREE.BoxGeometry(.07,.07,1.4);
const tracerMats={};
function tracerMat(c){ return tracerMats[c]||(tracerMats[c]=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false})); }
const _v=new THREE.Vector3(), _q=new THREE.Quaternion(), _fwd=new THREE.Vector3(0,0,1);

function spawnBullet(shooter,pos,dir,w,team){
  const mesh=bulletPool.pop()||new THREE.Mesh(tracerGeo,tracerMat(w.tracer)); mesh.material=tracerMat(w.tracer);
  mesh.position.copy(pos); mesh.quaternion.setFromUnitVectors(_fwd,dir); mesh.visible=true; scene.add(mesh);
  bullets.push({mesh,dir:dir.clone(),speed:w.speed,damage:w.damage,team,shooter,life:w.range/w.speed,px:pos.x,py:pos.y,pz:pos.z});
}
function fire(shooter,dir3,muzzle){
  const w=weapons[shooter.weapon];
  for(let i=0;i<w.pellets;i++){
    const d=dir3.clone(); if(w.spread){ d.x+=(Math.random()-.5)*w.spread*2; d.y+=(Math.random()-.5)*w.spread*1.2; d.z+=(Math.random()-.5)*w.spread*2; } d.normalize();
    spawnBullet(shooter,muzzle,d,w,shooter.team);
  }
  Audio.shot(shooter.weapon, shooter===player?null:{x:shooter.x,z:shooter.z});
  muzzleFlash(muzzle,dir3, shooter===player);
  if(shooter.mesh) shooter.mesh.userData.recoil=1;
}

// Mündungsfeuer (Sprite + ein geteiltes Punktlicht für den Spieler)
const flashTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'); const r=g.createRadialGradient(32,32,2,32,32,32); r.addColorStop(0,'rgba(255,255,220,1)'); r.addColorStop(.3,'rgba(255,190,80,.9)'); r.addColorStop(1,'rgba(255,120,0,0)'); g.fillStyle=r; g.fillRect(0,0,64,64); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t; })();
const flashPool=[]; const flashes=[];
const muzzleLight=new THREE.PointLight(0xffb060,0,14,2); scene.add(muzzleLight);
function muzzleFlash(pos,dir,isPlayer){
  const s=flashPool.pop()||new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  s.position.copy(pos).addScaledVector(dir,.6); s.scale.setScalar(1.2+Math.random()*.8); s.material.rotation=Math.random()*6.28; scene.add(s); flashes.push({s,life:.06});
  if(isPlayer){ muzzleLight.position.copy(pos); muzzleLight.intensity=25; }
}
// Funken / Einschläge
const particles=[]; const partPool=[];
const partGeo=new THREE.SphereGeometry(.07,5,4);
const partMats={spark:new THREE.MeshBasicMaterial({color:0xffc070}),dust:new THREE.MeshBasicMaterial({color:0xb9ab86,transparent:true,opacity:.8}),blood:new THREE.MeshBasicMaterial({color:0x8a1010}),fire:new THREE.MeshBasicMaterial({color:0xff7a20,blending:THREE.AdditiveBlending,transparent:true}),smoke:new THREE.MeshBasicMaterial({color:0x444444,transparent:true,opacity:.6})};
function burstParticles(pos,n,kind,speed=6,size=1,life=.4,gravity=18){
  for(let i=0;i<n;i++){ if(particles.length>260) return; const m=partPool.pop()||new THREE.Mesh(partGeo,partMats.spark); m.material=partMats[kind]; m.position.copy(pos); m.scale.setScalar(size*(.6+Math.random()*.8)); scene.add(m);
    particles.push({m,vx:(Math.random()-.5)*speed,vy:Math.random()*speed*.8+1,vz:(Math.random()-.5)*speed,life:life*(.6+Math.random()*.8),maxLife:life,gravity,grow: kind==='smoke'||kind==='fire'?1.6:0}); }
}
const decals=[];
function deathSplash(x,z){ if(!state.splash) return; const g=new THREE.Group(); const mat=new THREE.MeshBasicMaterial({color:0x7a0d0d,transparent:true,opacity:.85,depthWrite:false}); for(let i=0;i<7;i++){ const m=new THREE.Mesh(new THREE.CircleGeometry(.3+Math.random()*1.1,9),mat); m.rotation.x=-Math.PI/2; m.position.set((Math.random()-.5)*2.4,.015,(Math.random()-.5)*2.4); g.add(m);} g.position.set(x,0,z); g.rotation.y=Math.random()*6.28; scene.add(g); decals.push({g,mat,life:40}); }

/* ======================================================================
   SCHADEN, TREFFER, TOD
   ====================================================================== */
function damage(target,amount,attacker){
  if(!target.alive||target.invincible>0) return false;
  target.hp-=amount; target.lastHit=state.time;
  if(target===player){ hurtFlash(attacker); Audio.hurt(); state.shake=Math.max(state.shake,.35); }
  if(attacker===player){ UI.hitmark(target.hp<=0); Audio.hit(target.hp<=0); }
  if(target.hp<=0){ target.hp=0; target.alive=false; target.respawn=4; target.mesh.visible=false; deathSplash(target.x,target.z); burstParticles(new THREE.Vector3(target.x,1.8,target.z),10,state.splash?'blood':'dust',7,1.2,.5);
    if(target===player){ player.deaths++; player.streak=0; UI.streak(); UI.death(attacker); }
    if(attacker===player){ player.kills++; player.streak++; player.bestStreak=Math.max(player.bestStreak,player.streak); UI.streak(); if(player.streak===3) UI.toast('Helikopter bereit'); if(player.streak===7) UI.toast('Nuke bereit'); }
    const scoringTeam= target.team==='red'?'blue':'red'; if(attacker && attacker.team!==target.team){ state.score[scoringTeam]++; UI.score(); UI.feed(attacker,target); if(state.score[scoringTeam]>=GOAL) endMatch(scoringTeam==='blue'); }
    return true;
  }
  return false;
}
function hurtFlash(attacker){ if(!attacker) return; const dx=attacker.x-player.x, dz=attacker.z-player.z; const ang=Math.atan2(dx,dz); let rel=ang-cam.yaw; const deg=(-rel*180/Math.PI+180)%360; UI.hurtDir.style.setProperty('--a',deg+'deg'); UI.hurtDir.style.opacity=1; UI.hurtDirT=.5; }

function hitEntity(b,e){ // Segment gegen Kapsel (Körperzylinder)
  const nx=b.mesh.position.x,ny=b.mesh.position.y,nz=b.mesh.position.z;
  const ax=b.px-e.x,az=b.pz-e.z,bx=nx-e.x,bz=nz-e.z; const dx=bx-ax,dz=bz-az; const l2=dx*dx+dz*dz; let t=0; if(l2>0) t=Math.max(0,Math.min(1,-(ax*dx+az*dz)/l2));
  const cx=ax+dx*t,cz=az+dz*t; if(cx*cx+cz*cz>.78*.78) return false; const y=b.py+(ny-b.py)*t; return y>0&&y<3.6;
}
function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){ const b=bullets[i]; b.px=b.mesh.position.x; b.py=b.mesh.position.y; b.pz=b.mesh.position.z;
    b.mesh.position.addScaledVector(b.dir,b.speed*dt); b.life-=dt; const p=b.mesh.position; let remove=false, spark=true;
    if(b.life<=0){ remove=true; spark=false; }
    else if(p.y<0){ remove=true; p.y=.02; }
    else if(p.y<7&&blocked(p.x,p.z,.05)) remove=true;
    if(!remove && b.team!==player.team && player.alive && hitEntity(b,player)){ damage(player,b.damage,b.shooter); remove=true; spark=false; burstParticles(p,4,'dust',3,.8,.25); }
    if(!remove){ for(const bot of bots){ if(!bot.alive||bot.team===b.team) continue; if(hitEntity(b,bot)){ damage(bot,b.damage,b.shooter); remove=true; spark=false; burstParticles(p,4,state.splash?'blood':'dust',3,.8,.25); break; } } }
    if(!remove){ for(const tank of tanks){ if(hitTank(b,tank)){ damageTank(tank,b.damage); remove=true; break; } } }
    if(remove){ if(spark) burstParticles(p,4,'spark',5,.7,.3); scene.remove(b.mesh); bulletPool.push(b.mesh); bullets.splice(i,1); }
  }
}
function updateEffects(dt){
  for(let i=flashes.length-1;i>=0;i--){ const f=flashes[i]; f.life-=dt; if(f.life<=0){ scene.remove(f.s); flashPool.push(f.s); flashes.splice(i,1);} }
  muzzleLight.intensity*=Math.pow(.001,dt*2);
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=dt; if(p.life<=0){ scene.remove(p.m); partPool.push(p.m); particles.splice(i,1); continue; } p.vy-=p.gravity*dt; p.m.position.x+=p.vx*dt; p.m.position.y+=p.vy*dt; p.m.position.z+=p.vz*dt; if(p.m.position.y<0){ p.m.position.y=0; p.vy*=-.3; p.vx*=.7; p.vz*=.7; } if(p.grow) p.m.scale.multiplyScalar(1+p.grow*dt); }
  for(let i=decals.length-1;i>=0;i--){ const d=decals[i]; d.life-=dt; if(d.life<8) d.mat.opacity=.85*d.life/8; if(d.life<=0){ scene.remove(d.g); decals.splice(i,1);} }
}

/* ======================================================================
   BOT-KI
   ====================================================================== */
function findTarget(bot){
  let best=null,bd=1e9; const cands=[]; if(bot.team==='red'&&player.alive) cands.push(player);
  for(const b of bots) if(b.alive&&b.team!==bot.team) cands.push(b);
  for(const c of cands){ let d=Math.hypot(c.x-bot.x,c.z-bot.z); if(hasLOS(bot.x,bot.z,c.x,c.z)) d*=.55; if(c===player) d*=.85; if(d<bd){bd=d;best=c;} }
  return best;
}
function updateBots(dt){
  for(const bot of bots){
    if(!bot.alive){ bot.respawn-=dt; if(bot.respawn<=0){ bot.alive=true; bot.hp=100; bot.invincible=2; const s=teamSpawn(bot.team,bot.spawnIndex); bot.x=s.x; bot.z=s.z; bot.path=[]; bot.mesh.visible=true; bot.mesh.position.set(bot.x,0,bot.z); } continue; }
    if(bot.invincible>0) bot.invincible-=dt;
    bot.shootTimer-=dt; bot.targetTimer-=dt; bot.pathTimer-=dt; bot.strafeTimer-=dt;
    if(bot.targetTimer<=0){ bot.target=findTarget(bot); bot.targetTimer=.3+Math.random()*.2; }
    const t=bot.target; bot.moving=false;
    if(t&&t.alive){
      const dx=t.x-bot.x,dz=t.z-bot.z,dist=Math.hypot(dx,dz); const los=hasLOS(bot.x,bot.z,t.x,t.z);
      let mvx=0,mvz=0;
      if(los&&dist<24){ // im Gefecht: Abstand halten und seitlich ausweichen
        if(bot.strafeTimer<=0){ bot.strafeDir=Math.random()<.5?-1:1; bot.strafeTimer=.8+Math.random()*1.4; }
        const nx=dx/dist,nz=dz/dist; mvx=-nz*bot.strafeDir*.8; mvz=nx*bot.strafeDir*.8; if(dist<7){ mvx-=nx*.7; mvz-=nz*.7; } else if(dist>18){ mvx+=nx*.5; mvz+=nz*.5; }
        bot.path=[];
      } else {
        if(bot.pathTimer<=0||bot.path.length===0||bot.pathIndex>=bot.path.length||Math.hypot(t.x-bot.pathTargetX,t.z-bot.pathTargetZ)>4){ bot.path=findPath(bot.x,bot.z,t.x,t.z); bot.pathIndex=bot.path.length>1?1:0; bot.pathTargetX=t.x; bot.pathTargetZ=t.z; bot.pathTimer=.5+Math.random()*.3; }
        if(bot.path.length>1&&bot.pathIndex<bot.path.length){ const wp=bot.path[bot.pathIndex]; const wx=wp.x-bot.x,wz=wp.z-bot.z,wd=Math.hypot(wx,wz); if(wd<1.2) bot.pathIndex++; else { mvx=wx/wd; mvz=wz/wd; } }
        else if(dist>3){ mvx=dx/dist; mvz=dz/dist; }
      }
      if(mvx||mvz){ const l=Math.hypot(mvx,mvz); const ox=bot.x,oz=bot.z; moveEntity(bot,mvx/l*bot.speed*dt,mvz/l*bot.speed*dt); bot.moving=Math.hypot(bot.x-ox,bot.z-oz)>.001; if(!bot.moving){ bot.path=[]; bot.pathTimer=0; } }
      const wantYaw=Math.atan2(dx,dz); let dy=wantYaw-bot.faceYaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); bot.faceYaw+=dy*Math.min(1,dt*8);
      if(los&&dist<55&&bot.shootTimer<=0&&Math.abs(dy)<.35){
        const lead=0; const dir=new THREE.Vector3(dx,0,dz).normalize(); dir.x+=(Math.random()-.5)*.09; dir.z+=(Math.random()-.5)*.09; dir.normalize();
        const muzzle=new THREE.Vector3(bot.x+Math.cos(bot.faceYaw)*.32+dir.x*1.2,2.25,bot.z-Math.sin(bot.faceYaw)*.32+dir.z*1.2);
        fire({x:bot.x,z:bot.z,team:bot.team,weapon:'ak',mesh:bot.mesh,name:bot.name,isBot:true,ref:bot},dir,muzzle);
        bot.burst++; if(bot.burst>=3+Math.random()*4){ bot.burst=0; bot.shootTimer=.7+Math.random()*.9; } else bot.shootTimer=.14+Math.random()*.06;
      }
    }
    bot.mesh.position.set(bot.x,0,bot.z); bot.mesh.rotation.y=bot.faceYaw; animateCharacter(bot.mesh,bot.moving,dt);
  }
}

/* ======================================================================
   HELIKOPTER (Killstreak 3)
   ====================================================================== */
const heli={active:false,timer:0,angle:0,shotT:0,bombT:0,mesh:null,rotor:null,tail:null,used:false};
(function buildHeli(){
  const g=new THREE.Group(); const m=new THREE.MeshStandardMaterial({color:0x3b4a3a,roughness:.6,metalness:.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.8,5.5),m); body.castShadow=true; g.add(body);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(1.15,12,10),new THREE.MeshStandardMaterial({color:0x8fb6d8,roughness:.2,metalness:.5})); nose.position.set(0,.1,2.9); nose.scale.set(1,.8,1); g.add(nose);
  const boom=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,5),m); boom.position.set(0,.3,-4.8); g.add(boom);
  const fin=new THREE.Mesh(new THREE.BoxGeometry(.2,1.6,1),m); fin.position.set(0,1,-7); g.add(fin);
  const rotor=new THREE.Mesh(new THREE.BoxGeometry(11,.08,.5),new THREE.MeshStandardMaterial({color:0x222,transparent:true,opacity:.7})); rotor.position.y=1.2; g.add(rotor);
  const rotor2=rotor.clone(); rotor2.rotation.y=Math.PI/2; rotor.add(rotor2);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(.06,2,.3),new THREE.MeshStandardMaterial({color:0x222})); tail.position.set(.4,1,-7); g.add(tail);
  for(const s of [-1,1]){ const skid=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,4.5),m); skid.position.set(s*1.1,-1.3,.2); g.add(skid); const gun=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1.6,8),gunMat); gun.rotation.x=Math.PI/2; gun.position.set(s*1.6,-.6,1.8); g.add(gun); }
  const light=new THREE.PointLight(0xff3020,0,30,2); light.position.y=-.8; g.add(light); g.userData.light=light;
  g.visible=false; scene.add(g); heli.mesh=g; heli.rotor=rotor; heli.tail=tail;
})();
function callHeli(){ if(heli.active||player.streak<3) return; heli.active=true; heli.timer=30; heli.angle=Math.atan2(player.x,player.z); heli.mesh.visible=true; heli.mesh.position.set(Math.sin(heli.angle)*70,26,Math.cos(heli.angle)*70); player.streak-=3; UI.streak(); UI.toast('Helikopter im Anflug'); Audio.heliStart(); heli.bombT=6; }
const bombs=[]; const smokes=[];
function updateHeli(dt){
  if(!heli.active) return; heli.timer-=dt; heli.rotor.rotation.y+=dt*40; heli.tail.rotation.x+=dt*50;
  heli.angle+=dt*.32; const r=34, tx=Math.sin(heli.angle)*r, tz=Math.cos(heli.angle)*r; const p=heli.mesh.position;
  const ty= heli.timer<2.5? 26 : 17+Math.sin(state.time*.7)*1.5;
  p.x+=(tx-p.x)*dt*1.4; p.z+=(tz-p.z)*dt*1.4; p.y+=(ty-p.y)*dt*1.2;
  const yaw=Math.atan2(tx-p.x,tz-p.z); heli.mesh.rotation.set(0,yaw,0); heli.mesh.rotation.z=Math.sin(state.time*1.3)*.08; heli.mesh.rotation.x=-.12;
  heli.mesh.userData.light.intensity= (Math.sin(state.time*6)>.7)?12:0;
  heli.shotT-=dt; heli.bombT-=dt;
  const enemies=bots.filter(b=>b.alive&&b.team==='red');
  if(heli.timer>2.5&&enemies.length){
    if(heli.shotT<=0){ heli.shotT=.09; const t=enemies[Math.floor(Math.random()*enemies.length)]; const dir=new THREE.Vector3(t.x-p.x,1.6-p.y,t.z-p.z).normalize(); dir.x+=(Math.random()-.5)*.05; dir.z+=(Math.random()-.5)*.05; dir.normalize();
      fire({x:p.x,z:p.z,team:'blue',weapon:'ak',name:'Heli',isHeli:true},dir,p.clone().add(new THREE.Vector3(0,-.8,1.5))); }
    if(heli.bombT<=0){ heli.bombT=7; const t=enemies[Math.floor(Math.random()*enemies.length)]; const b=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),new THREE.MeshStandardMaterial({color:0x2c2c2c,roughness:.6,metalness:.5})); b.position.set(p.x,p.y-1.5,p.z); b.castShadow=true; scene.add(b); bombs.push({m:b,tx:t.x,tz:t.z,vy:0}); }
  }
  if(heli.timer<=0){ heli.active=false; heli.mesh.visible=false; Audio.heliStop(); UI.streak(); }
}
function explode(x,z,radius,dmg,big=false){
  Audio.explosion({x,z},big); state.shake=Math.max(state.shake,big?1.2:.7);
  const p=new THREE.Vector3(x,.6,z); burstParticles(p,26,'fire',11,2.6,.5,3); burstParticles(p,18,'smoke',5,2.2,2.2,-1.2); burstParticles(p,20,'dust',12,1.2,.8);
  const light=new THREE.PointLight(0xff8030,80,radius*4,2); light.position.set(x,2,z); scene.add(light); smokes.push({light,life:.5});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.5,1.2,40),new THREE.MeshBasicMaterial({color:0xffe0a0,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.set(x,.05,z); scene.add(ring); smokes.push({ring,life:.45});
  const scorch=new THREE.Mesh(new THREE.CircleGeometry(radius*.55,20),new THREE.MeshBasicMaterial({color:0x1a1611,transparent:true,opacity:.7,depthWrite:false})); scorch.rotation.x=-Math.PI/2; scorch.position.set(x,.012,z); scene.add(scorch); decals.push({g:scorch,mat:scorch.material,life:60});
  const hit=(e,attacker)=>{ if(!e.alive) return; const d=Math.hypot(e.x-x,e.z-z); if(d<=radius) damage(e,dmg*(1-.5*d/radius),attacker); };
  hit(player,{name:'Heli',team:'blue',x,z}); for(const b of bots) hit(b, big? player : {name:'Heli',team:'blue',x,z,isHeli:true});
}
function updateBombs(dt){
  for(let i=bombs.length-1;i>=0;i--){ const b=bombs[i]; b.vy-=22*dt; b.m.position.y+=b.vy*dt; b.m.position.x+=(b.tx-b.m.position.x)*dt*1.5; b.m.position.z+=(b.tz-b.m.position.z)*dt*1.5; if(b.m.position.y<=.4){ explode(b.m.position.x,b.m.position.z,7,90); scene.remove(b.m); bombs.splice(i,1);} }
  for(let i=smokes.length-1;i>=0;i--){ const s=smokes[i]; s.life-=dt; if(s.light) s.light.intensity=80*Math.max(0,s.life/.5); if(s.ring){ s.ring.scale.setScalar(1+(1-s.life/.45)*14); s.ring.material.opacity=.8*Math.max(0,s.life/.45);} if(s.life<=0){ if(s.light) scene.remove(s.light); if(s.ring) scene.remove(s.ring); smokes.splice(i,1);} }
}

/* ======================================================================
   NUKE (Killstreak 7) – beendet die Runde
   ====================================================================== */
const nuke={active:false,t:0,group:null,used:false};
function launchNuke(){
  if(nuke.active||player.streak<7) return; nuke.active=true; nuke.t=0; player.streak-=7; UI.streak(); UI.toast('Taktische Nuke – Einschlag in 5'); Audio.siren(); UI.hideCross(true);
}
function updateNuke(dt){
  if(!nuke.active) return; const prev=nuke.t; nuke.t+=dt;
  if(prev<3.8&&nuke.t>=3.8){ UI.toast(''); }
  if(prev<4.5&&nuke.t>=4.5){ // Blitz
    UI.flash.style.transition='none'; UI.flash.style.opacity=1; Audio.explosion(null,true); state.shake=2.5;
    const x=0,z=0; const g=new THREE.Group(); g.position.set(x,0,z); scene.add(g); nuke.group=g;
    const fireMat=new THREE.MeshBasicMaterial({color:0xffb050,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
    const cloudMat=new THREE.MeshStandardMaterial({color:0x6a5a4a,emissive:0xff6a10,emissiveIntensity:1.2,roughness:1,transparent:true,opacity:.98});
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(3,7,26,24),cloudMat); stem.position.y=13; g.add(stem);
    for(let i=0;i<9;i++){ const c=new THREE.Mesh(new THREE.SphereGeometry(6+Math.random()*4,20,14),cloudMat); const a=i/9*6.28; c.position.set(Math.cos(a)*7,26+Math.random()*4,Math.sin(a)*7); g.add(c); }
    const core=new THREE.Mesh(new THREE.SphereGeometry(9,24,16),fireMat); core.position.y=27; g.add(core);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1,3,64),new THREE.MeshBasicMaterial({color:0xfff0c0,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=.1; g.add(ring); g.userData={ring,core,stem,cloudMat};
    const light=new THREE.PointLight(0xffc080,400,300,1.6); light.position.set(0,20,0); g.add(light); g.userData.light=light;
    g.scale.setScalar(.05);
    for(const b of bots) if(b.alive&&b.team==='red') damage(b,999,player);
  }
  if(nuke.t>=4.5){
    const a=nuke.t-4.5; UI.flash.style.opacity=Math.max(0,1-a*.9);
    const g=nuke.group, u=g.userData; const s=Math.min(1,a/2.2); g.scale.set(.05+s*.95,.05+s*.95,.05+s*.95); g.position.y=a*1.2;
    u.ring.scale.setScalar(1+a*45); u.ring.material.opacity=Math.max(0,1-a/1.6); u.core.material.opacity=Math.max(.2,.95-a*.25); u.cloudMat.emissiveIntensity=Math.max(.15,1.2-a*.35); u.light.intensity=400*Math.max(.1,1-a*.4);
    g.rotation.y+=dt*.15; state.shake=Math.max(state.shake, 1.2*Math.max(0,1-a/2));
  }
  if(nuke.t>=10.5){ nuke.active=false; endMatch(true,'Taktische Nuke'); }
}

/* ======================================================================
   HUD
   ====================================================================== */
const $=id=>document.getElementById(id);
const UI={
  hud:$('hud'), hpNum:$('hpNum'), hpFill:$('hpFill'), hpBar:$('hpBar'), ammoMag:$('ammoMag'), ammoRes:$('ammoRes'), weaponLabel:$('weaponLabel'), reloadTag:$('reloadTag'),
  scoreBlue:$('scoreBlue'), scoreRed:$('scoreRed'), cross:$('crosshair'), center:$('center'), centerTitle:$('centerTitle'), centerSub:$('centerSub'), toastEl:$('toast'), feedEl:$('killfeed'),
  vignette:$('vignette'), flash:$('flash'), hurtDir:$('hurtDir'), hurtDirT:0, streakN:$('streakN'), btnHeli:$('btnHeli'), btnNuke:$('btnNuke'), toastT:null,
  score(){ this.scoreBlue.textContent=state.score.blue; this.scoreRed.textContent=state.score.red; },
  hitmark(kill){ this.cross.classList.remove('hit','kill'); void this.cross.offsetWidth; this.cross.classList.add('hit'); if(kill) this.cross.classList.add('kill'); },
  hideCross(h){ this.cross.classList.toggle('hidden',h); },
  streak(){ this.streakN.textContent=player.streak; this.btnHeli.classList.toggle('ready',player.streak>=3&&!heli.active); this.btnHeli.classList.toggle('active',heli.active); this.btnNuke.classList.toggle('ready',player.streak>=7&&!nuke.active); },
  toast(msg){ clearTimeout(this.toastT); this.toastEl.textContent=msg; this.toastEl.classList.toggle('show',!!msg); if(msg) this.toastT=setTimeout(()=>this.toastEl.classList.remove('show'),2200); },
  feed(a,t){ const d=document.createElement('div'); const isMe=a===player; const cls=x=>x==='blue'?'b':'r'; d.innerHTML=`<span class="${cls(a.team)}">${a.name}</span> ▸ <span class="${cls(t.team)}">${t.name}</span>`; if(isMe||t===player) d.classList.add('me'); this.feedEl.prepend(d); while(this.feedEl.children.length>5) this.feedEl.lastChild.remove(); setTimeout(()=>d.remove(),6000); },
  death(by){ this.center.hidden=false; this.centerTitle.textContent='Du bist gefallen'; this.centerSub.innerHTML=(by?`Von ${by.name} · `:'')+`Respawn in <b id="respawnN">4</b>`; this.hideCross(true); },
  respawn(){ this.center.hidden=true; this.hideCross(false); },
  weapon(){ const w=weapons[player.weapon]; this.weaponLabel.textContent=w.name; document.querySelectorAll('.wpn').forEach(b=>b.classList.toggle('active',b.dataset.w===player.weapon)); },
  status(){ const hp=Math.ceil(player.hp); this.hpNum.textContent=hp; this.hpFill.style.transform=`scaleX(${player.hp/100})`; this.hpBar.classList.toggle('low',player.hp<35); this.ammoMag.textContent=player.mag; this.reloadTag.classList.toggle('on',player.reloading>0); }
};

/* ======================================================================
   EINGABE – Tastatur, Maus (Pointer Lock), Touch-Joysticks, Wischen
   ====================================================================== */
const input={ mx:0,mz:0, ax:0,az:0, fire:false, keys:{}, aimStick:false };
addEventListener('keydown',e=>{ if(e.repeat) return; input.keys[e.code]=true; if(state.phase!=='play') return;
  if(e.code==='Digit1') selectWeapon('ak'); if(e.code==='Digit2') selectWeapon('shotgun'); if(e.code==='Digit3') selectWeapon('sniper');
  if(e.code==='Tab'){ e.preventDefault(); openWeaponWheel(); }
  if(e.code==='KeyR') reload(); if(e.code==='KeyH') callHeli(); if(e.code==='KeyN') launchNuke(); });
addEventListener('keyup',e=>{ input.keys[e.code]=false; if(e.code==='Tab') closeWeaponWheel(); });
// Mausrad: Waffe wechseln
addEventListener('wheel',e=>{ if(state.phase!=='play') return; const wl=['ak','shotgun','sniper']; let i=wl.indexOf(player.weapon); i= e.deltaY>0? (i+1)%3 : (i+2)%3; selectWeapon(wl[i]); },{passive:true});
addEventListener('blur',()=>{ input.keys={}; input.fire=false; });

// Maus
canvas.addEventListener('mousedown',e=>{ if(state.phase!=='play'||isTouchPointer) return; if(document.pointerLockElement!==canvas){ canvas.requestPointerLock(); return; } if(e.button===0) input.fire=true; });
addEventListener('mouseup',e=>{ if(e.button===0) input.fire=false; });
addEventListener('mousemove',e=>{ if(document.pointerLockElement===canvas){ const s=state.sens*.00022; cam.yaw-=e.movementX*s; cam.pitch=Math.max(-.35,Math.min(.6,cam.pitch+e.movementY*s*.8)); } });
document.addEventListener('pointerlockchange',()=>{ $('hint').classList.toggle('show', state.phase==='play'&&!isTouch&&document.pointerLockElement!==canvas); });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
let isTouchPointer=false;

// Joysticks
function joystick(el,cb){
  const knob=el.querySelector('.knob'); let id=null; const max=46;
  const upd=e=>{ const r=el.getBoundingClientRect(); let x=e.clientX-(r.left+r.width/2), y=e.clientY-(r.top+r.height/2); const d=Math.hypot(x,y); if(d>max){ x=x/d*max; y=y/d*max; } knob.style.transform=`translate(${x}px,${y}px)`; cb(x/max,y/max,true); };
  el.addEventListener('pointerdown',e=>{ if(id!==null) return; id=e.pointerId; el.setPointerCapture(id); el.classList.add('on'); upd(e); e.preventDefault(); });
  el.addEventListener('pointermove',e=>{ if(e.pointerId===id) upd(e); });
  const end=e=>{ if(e.pointerId!==id) return; id=null; el.classList.remove('on'); knob.style.transform='translate(0,0)'; cb(0,0,false); };
  el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end); el.addEventListener('lostpointercapture',end);
}
joystick($('joyMove'),(x,y)=>{ input.mx=x; input.mz=y; });
joystick($('joyAim'),(x,y,on)=>{ input.ax=x; input.az=y; input.aimStick=on&&Math.hypot(x,y)>.3; });
// Wischen zum Umsehen (Touch oder Maus ohne Pointer Lock)
let swipe=null;
canvas.addEventListener('pointerdown',e=>{ if(e.pointerType==='touch') isTouchPointer=true; if(state.phase!=='play') return; if(e.pointerType==='mouse'&&document.pointerLockElement===canvas) return; swipe={id:e.pointerId,x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove',e=>{ if(!swipe||e.pointerId!==swipe.id) return; const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y; swipe.x=e.clientX; swipe.y=e.clientY; const s=state.sens*.0011; cam.yaw-=dx*s; cam.pitch=Math.max(-.35,Math.min(.6,cam.pitch+dy*s*.5)); });
const endSwipe=e=>{ if(swipe&&e.pointerId===swipe.id) swipe=null; };
canvas.addEventListener('pointerup',endSwipe); canvas.addEventListener('pointercancel',endSwipe);
// Buttons
document.querySelectorAll('.wpn').forEach(b=>b.addEventListener('click',()=>selectWeapon(b.dataset.w)));
// Radiales Waffenrad: Touch/Maus Events
const wwEl=$('weaponWheel');
if(wwEl){
  const wwBtn=$('btnWeaponWheel');
  if(wwBtn){ wwBtn.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); openWeaponWheel(); });
    wwBtn.addEventListener('pointerup',e=>{ e.stopPropagation(); closeWeaponWheel(); });
    wwBtn.addEventListener('pointercancel',e=>closeWeaponWheel()); }
  document.querySelectorAll('.ww-slot').forEach(s=>{
    s.addEventListener('pointerenter',()=>hoverWeaponSlot(s.dataset.w));
    s.addEventListener('pointerdown',e=>{ e.stopPropagation(); hoverWeaponSlot(s.dataset.w); });
    s.addEventListener('pointerup',e=>{ e.stopPropagation(); closeWeaponWheel(); });
  });
}
$('btnHeli').addEventListener('click',callHeli); $('btnNuke').addEventListener('click',launchNuke);
$('btnReload').addEventListener('pointerdown',e=>{ e.preventDefault(); reload(); });
$('btnCam').addEventListener('pointerdown',e=>{ e.preventDefault(); cam.yaw=player.faceYaw; cam.pitch=.12; });
// Overlays dürfen keine Spielsteuerung auslösen
document.querySelectorAll('.streak,.wpn,.tbtn,.ww-slot,#btnWeaponWheel,#weaponWheel').forEach(el=>el.addEventListener('pointerdown',e=>e.stopPropagation()));

// Smoothe Waffenwechsel-Animation
const weaponSwitch = { active:false, timer:0, from:'ak', to:'ak', duration:.32 };
function selectWeapon(w){ if(player.weapon===w||player.reloading>0||weaponSwitch.active) return; weaponSwitch.active=true; weaponSwitch.timer=weaponSwitch.duration; weaponSwitch.from=player.weapon; weaponSwitch.to=w; Audio.click(); }
function updateWeaponSwitch(dt){
  if(!weaponSwitch.active) return;
  weaponSwitch.timer-=dt;
  const half=weaponSwitch.duration/2;
  if(weaponSwitch.timer<=half && player.weapon!==weaponSwitch.to){ player.weapon=weaponSwitch.to; player.mag=weapons[weaponSwitch.to].mag; player.shootTimer=.15; UI.weapon(); UI.status(); }
  const prog=1-weaponSwitch.timer/weaponSwitch.duration;
  const dip=prog<.5? prog*2 : 2-prog*2;
  if(player.mesh.userData.gun) player.mesh.userData.gun.position.y=2.25-dip*.6;
  if(weaponSwitch.timer<=0){ weaponSwitch.active=false; if(player.mesh.userData.gun) player.mesh.userData.gun.position.y=2.25; }
}
function reload(){ const w=weapons[player.weapon]; if(player.reloading>0||player.mag===w.mag||!player.alive) return; player.reloading=w.reload; Audio.reload(); UI.status(); }
// Radial-Waffenrad
const weaponWheel = { open:false, selected:null, holdTimer:0 };
function openWeaponWheel(){ weaponWheel.open=true; weaponWheel.selected=null; const el=$('weaponWheel'); if(el) el.classList.add('open'); }
function closeWeaponWheel(){ const el=$('weaponWheel'); if(el) el.classList.remove('open'); if(weaponWheel.selected) selectWeapon(weaponWheel.selected); weaponWheel.open=false; weaponWheel.selected=null; }
function hoverWeaponSlot(w){ weaponWheel.selected=w; document.querySelectorAll('.ww-slot').forEach(s=>s.classList.toggle('hover',s.dataset.w===w)); }

/* ======================================================================
   SPIELER
   ====================================================================== */
const aimDir=new THREE.Vector3();
function aimAssist(dir){
  if(!state.assist) return dir; let best=null,ba=.22;
  for(const b of bots){ if(!b.alive||b.team===player.team) continue; const dx=b.x-player.x,dz=b.z-player.z,d=Math.hypot(dx,dz); if(d>45) continue; const a=Math.acos(Math.max(-1,Math.min(1,(dx*dir.x+dz*dir.z)/d))); if(a<ba&&hasLOS(player.x,player.z,b.x,b.z)){ ba=a; best=b; } }
  if(best){ const t=new THREE.Vector3(best.x-player.x,0,best.z-player.z).normalize(); dir.lerp(t,.85).normalize(); }
  return dir;
}
function updatePlayer(dt){
  const P=player;
  if(!P.alive){ P.respawn-=dt; const n=$('respawnN'); if(n) n.textContent=Math.max(0,Math.ceil(P.respawn));
    if(P.respawn<=0){ P.alive=true; P.hp=100; P.invincible=2; P.mag=weapons[P.weapon].mag; P.reloading=0; const s=teamSpawn('blue',Math.floor(Math.random()*7)); P.x=s.x; P.z=s.z; P.mesh.visible=true; cam.yaw=Math.atan2(-P.x,-P.z); UI.respawn(); UI.status(); }
    return; }
  if(P.invincible>0) P.invincible-=dt;
  P.shootTimer-=dt;
  if(P.reloading>0){ P.reloading-=dt; if(P.reloading<=0){ P.reloading=0; P.mag=weapons[P.weapon].mag; UI.status(); } }
  if(state.time-P.lastHit>4.5&&P.hp<100){ P.hp=Math.min(100,P.hp+22*dt); UI.status(); }

  // Bewegung relativ zur Kamera
  let mx=input.mx, mz=input.mz;
  if(input.keys.KeyW||input.keys.ArrowUp) mz-=1; if(input.keys.KeyS||input.keys.ArrowDown) mz+=1; if(input.keys.KeyA||input.keys.ArrowLeft) mx-=1; if(input.keys.KeyD||input.keys.ArrowRight) mx+=1;
  const len=Math.hypot(mx,mz); let moving=false;
  if(len>.08){ const s=Math.min(1,len); mx/=len; mz/=len; const fx=-Math.sin(cam.yaw), fz=-Math.cos(cam.yaw); const rx=Math.cos(cam.yaw), rz=-Math.sin(cam.yaw);
    const dx=(rx*mx - fx*mz), dz=(rz*mx - fz*mz); const speed=9.5*s*(P.reloading>0?.8:1); const ox=P.x,oz=P.z; moveEntity(P,dx*speed*dt,dz*speed*dt); moving=Math.hypot(P.x-ox,P.z-oz)>.0005;
    if(moving){ P.stepT+=dt*speed; if(P.stepT>4.2){ P.stepT=0; Audio.step(); } }
    if(!input.aimStick&&!input.fire){ const want=Math.atan2(dx,dz); let d=want-P.faceYaw; d=Math.atan2(Math.sin(d),Math.cos(d)); P.faceYaw+=d*Math.min(1,dt*12); }
  }
  // Zielrichtung: Maus = Kamerarichtung, Touch = rechter Stick relativ zur Kamera
  let wantFire=false;
  if(input.aimStick){ const ax=input.ax,az=input.az; const fx=-Math.sin(cam.yaw), fz=-Math.cos(cam.yaw); const rx=Math.cos(cam.yaw), rz=-Math.sin(cam.yaw); aimDir.set(rx*ax - fx*az,0,rz*ax - fz*az).normalize(); aimAssist(aimDir); wantFire=true; }
  else if(input.fire){ aimDir.set(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw)); wantFire=true; }
  if(wantFire){ const want=Math.atan2(aimDir.x,aimDir.z); let d=want-P.faceYaw; d=Math.atan2(Math.sin(d),Math.cos(d)); P.faceYaw+=d*Math.min(1,dt*18); }
  const w=weapons[P.weapon];
  if(wantFire&&P.shootTimer<=0&&P.reloading<=0){
    if(P.mag<=0){ reload(); }
    else if(w.auto||!P.firedHeld){ P.mag--; P.shootTimer=w.cooldown; P.firedHeld=true; const muzzle=new THREE.Vector3(P.x+Math.cos(P.faceYaw)*.32+aimDir.x*1.3,2.25,P.z-Math.sin(P.faceYaw)*.32+aimDir.z*1.3); fire(P,aimDir,muzzle); state.shake=Math.max(state.shake,w.kick*.08); UI.status(); if(P.mag===0) reload(); }
  }
  if(!wantFire) P.firedHeld=false;
  P.mesh.position.set(P.x,0,P.z); P.mesh.rotation.y=P.faceYaw; animateCharacter(P.mesh,moving,dt);
  P.mesh.visible= P.invincible<=0 || Math.sin(state.time*30)>0;
}

/* ======================================================================
   KAMERA
   ====================================================================== */
const camTarget=new THREE.Vector3(), camPos=new THREE.Vector3(), camLook=new THREE.Vector3(), camLookTarget=new THREE.Vector3();
function updateCamera(dt){
  const P=player; const d=cam.dist, pitch=cam.pitch;
  const aimOffX = -Math.sin(cam.yaw)*1.8, aimOffZ = -Math.cos(cam.yaw)*1.8;
  const cx=P.x+Math.sin(cam.yaw)*d*Math.cos(pitch), cz=P.z+Math.cos(cam.yaw)*d*Math.cos(pitch), cy=2.4+d*Math.sin(pitch)+2.2;
  let t=1; const sx=P.x,sz=P.z; for(let k=.15;k<=1;k+=.05){ const px=sx+(cx-sx)*k, pz=sz+(cz-sz)*k; if(blocked(px,pz,.5)){ t=Math.max(.15,k-.08); break; } }
  camTarget.set(sx+(cx-sx)*t, cy*(.6+.4*t), sz+(cz-sz)*t);
  const camSmooth = 1-Math.pow(.00008,dt);
  camPos.lerp(camTarget, camSmooth);
  const shake=state.shake; state.shake=Math.max(0,shake-dt*4);
  camera.position.copy(camPos); if(shake>0){ camera.position.x+=(Math.random()-.5)*shake*.22; camera.position.y+=(Math.random()-.5)*shake*.18; }
  camLookTarget.set(P.x + aimOffX, 2.2, P.z + aimOffZ);
  camLook.lerp(camLookTarget, 1-Math.pow(.0001,dt));
  camera.lookAt(camLook);
  sun.position.set(P.x+40,70,P.z+25); sun.target.position.set(P.x,0,P.z);
}
function menuCamera(dt){ const a=state.time*.08; camera.position.lerp(new THREE.Vector3(Math.sin(a)*48,18,Math.cos(a)*48),.02); camera.lookAt(0,2,0); camPos.copy(camera.position); }


/* ======================================================================
   PANZER - je einer pro Team, 500 HP, spawnt nur einmal
   ====================================================================== */
const tankMats={ blue:new THREE.MeshStandardMaterial({color:0x3a5a3a,roughness:.65,metalness:.5}), red:new THREE.MeshStandardMaterial({color:0x6a4a2a,roughness:.65,metalness:.5}) };
const tankTrackMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:.9,metalness:.3});
const tankBarrelMat=new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:.5,metalness:.7});
function buildTankMesh(team){
  const g=new THREE.Group();
  const hull=new THREE.Mesh(new THREE.BoxGeometry(4.5,1.5,7),tankMats[team]); hull.position.y=1.2; hull.castShadow=hull.receiveShadow=true; g.add(hull);
  for(const s of [-1,1]){ const track=new THREE.Mesh(new THREE.BoxGeometry(.8,1.0,7.4),tankTrackMat); track.position.set(s*2.6,.8,0); track.castShadow=true; g.add(track);
    for(let z=-2.5;z<=2.5;z+=1.25){ const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.3,12),tankTrackMat); wheel.rotation.z=Math.PI/2; wheel.position.set(s*2.6,.6,z); g.add(wheel); }
  }
  const turret=new THREE.Group(); turret.position.set(0,2.2,.3);
  const turretBody=new THREE.Mesh(new THREE.BoxGeometry(3,1.2,3.5),tankMats[team]); turretBody.castShadow=true; turret.add(turretBody);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,5,10),tankBarrelMat); barrel.rotation.x=Math.PI/2; barrel.position.set(0,.1,4); barrel.castShadow=true; turret.add(barrel);
  const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.2,12),tankBarrelMat); hatch.position.set(0,.7,-.5); turret.add(hatch);
  g.add(turret); g.userData.turret=turret; return g;
}
const tanks=[];
function tankBlocked(x,z,tank){
  // Kollisionspruefung fuer Panzer (breiter als Spieler), eigenes Hindernis ignorieren
  if(x<-HALF+4||x>HALF-4||z<-HALF+4||z>HALF-4) return true;
  const r=3.2;
  for(const o of obstacles){ if(o.dynamic&&o.tank===tank) continue; if(x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r) return true; }
  return false;
}
function tankMoveTo(tank,dx,dz){
  // Einzelachsen-Bewegung wie moveEntity, aber fuer Panzer
  if(!tankBlocked(tank.x+dx,tank.z,tank)) tank.x+=dx;
  if(!tankBlocked(tank.x,tank.z+dz,tank)) tank.z+=dz;
}
function spawnTank(team){
  const spawnX= team==='blue'? -35 : 35, spawnZ= team==='blue'? 38 : -38;
  const mesh=buildTankMesh(team); mesh.position.set(spawnX,0,spawnZ); scene.add(mesh);
  const yaw= team==='blue'? Math.PI : 0; mesh.rotation.y=yaw;
  const tank={ team, x:spawnX, z:spawnZ, yaw, hp:500, maxHp:500, alive:true, mesh, speed:4.5, turretYaw:0, shootTimer:3, cooldown:2.8, target:null, targetTimer:0, radius:2.8,
    // Pathfinding-State
    path:[], pathIndex:0, pathTimer:0, goalX:0, goalZ:team==='blue'?15:-15,
    // Stuck-Detection
    stuckTimer:0, lastMoveX:spawnX, lastMoveZ:spawnZ, steerAngle:0
  };
  tanks.push(tank);
  tank.obstacle={ x:spawnX, z:spawnZ, w:5.5, h:3, d:8, dynamic:true, tank }; obstacles.push(tank.obstacle);
  return tank;
}
function updateTanks(dt){
  for(const tank of tanks){
    if(!tank.alive) continue;
    tank.shootTimer-=dt; tank.targetTimer-=dt; tank.pathTimer-=dt;
    // --- Zielsuche ---
    if(tank.targetTimer<=0){
      tank.targetTimer=.6; let best=null,bd=1e9;
      const enemies=[...bots.filter(b=>b.alive&&b.team!==tank.team)];
      if(tank.team==='red'&&player.alive) enemies.push(player);
      for(const e of enemies){ const d=Math.hypot(e.x-tank.x,e.z-tank.z); if(d<bd&&hasLOS(tank.x,tank.z,e.x,e.z)){bd=d;best=e;} }
      tank.target=best;
    }
    // --- Turm + Schiessen ---
    if(tank.target&&tank.target.alive){
      const dx=tank.target.x-tank.x, dz=tank.target.z-tank.z;
      const wantYaw=Math.atan2(dx,dz)-tank.yaw;
      let dy=wantYaw-tank.turretYaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy));
      tank.turretYaw+=dy*Math.min(1,dt*3); tank.mesh.userData.turret.rotation.y=tank.turretYaw;
      const dist=Math.hypot(dx,dz);
      if(tank.shootTimer<=0&&dist<50&&Math.abs(dy)<.2){
        tank.shootTimer=tank.cooldown;
        const absYaw=tank.yaw+tank.turretYaw;
        const dir=new THREE.Vector3(Math.sin(absYaw),0,Math.cos(absYaw));
        const muzzle=new THREE.Vector3(tank.x+dir.x*5,2.5,tank.z+dir.z*5);
        const w={speed:110,damage:80,pellets:1,spread:0,range:100,tracer:0xff6020};
        spawnBullet({name:'Panzer',team:tank.team,x:tank.x,z:tank.z},muzzle,dir,w,tank.team);
        Audio.explosion({x:tank.x,z:tank.z},false);
        burstParticles(muzzle,8,'fire',8,2,.3,2); state.shake=Math.max(state.shake,.5);
      }
    }
    // --- Bewegung mit Pathfinding + Stuck-Detection ---
    const gx=tank.goalX, gz=tank.goalZ;
    const distToGoal=Math.hypot(gx-tank.x,gz-tank.z);
    if(distToGoal>5){
      // Stuck-Detection: hat sich der Panzer in den letzten 2s kaum bewegt?
      tank.stuckTimer+=dt;
      if(tank.stuckTimer>2){
        const moved=Math.hypot(tank.x-tank.lastMoveX,tank.z-tank.lastMoveZ);
        if(moved<1.5){
          // Festgefahren! Neuen Ausweichpunkt setzen
          tank.steerAngle+=(Math.random()>.5?1:-1)*(.8+Math.random()*.6);
          tank.path=[]; tank.pathTimer=0;
        }
        tank.lastMoveX=tank.x; tank.lastMoveZ=tank.z; tank.stuckTimer=0;
      }
      // A*-Pfad berechnen (seltener als Bots, da Panzer langsamer)
      if(tank.pathTimer<=0||tank.path.length===0||tank.pathIndex>=tank.path.length){
        tank.path=findPath(tank.x,tank.z,gx,gz);
        tank.pathIndex=tank.path.length>1?1:0;
        tank.pathTimer=1.5+Math.random()*.5;
      }
      let mvx=0,mvz=0;
      if(tank.path.length>1&&tank.pathIndex<tank.path.length){
        // Dem Pfad folgen
        const wp=tank.path[tank.pathIndex];
        const wx=wp.x-tank.x, wz=wp.z-tank.z, wd=Math.hypot(wx,wz);
        if(wd<3) tank.pathIndex++;
        else { mvx=wx/wd; mvz=wz/wd; }
      } else {
        // Fallback: Richtung Ziel mit Ausweichwinkel
        const ddx=gx-tank.x, ddz=gz-tank.z, dd=Math.hypot(ddx,ddz);
        if(dd>.1){ mvx=ddx/dd; mvz=ddz/dd; }
      }
      // Ausweichwinkel anwenden (fadet langsam aus)
      if(Math.abs(tank.steerAngle)>.05){
        const sa=tank.steerAngle;
        const rmx=mvx*Math.cos(sa)-mvz*Math.sin(sa);
        const rmz=mvx*Math.sin(sa)+mvz*Math.cos(sa);
        mvx=rmx; mvz=rmz;
        tank.steerAngle*=Math.pow(.3,dt); // Ausfaden
      }
      if(mvx||mvz){
        const l=Math.hypot(mvx,mvz);
        tankMoveTo(tank,mvx/l*tank.speed*dt,mvz/l*tank.speed*dt);
        // Panzer-Rumpf dreht sich in Fahrtrichtung (langsam)
        const wy=Math.atan2(mvx,mvz); let d2=wy-tank.yaw;
        d2=Math.atan2(Math.sin(d2),Math.cos(d2));
        tank.yaw+=d2*Math.min(1,dt*1.8);
      }
    }
    tank.mesh.position.set(tank.x,0,tank.z); tank.mesh.rotation.y=tank.yaw;
    tank.obstacle.x=tank.x; tank.obstacle.z=tank.z;
  }
}
function damageTank(tank,amount){
  if(!tank.alive) return;
  tank.hp-=amount; burstParticles(new THREE.Vector3(tank.x,2,tank.z),6,'spark',8,1.2,.4);
  if(tank.hp<=0){ tank.hp=0; tank.alive=false; tank.mesh.visible=false; explode(tank.x,tank.z,10,60,true);
    UI.toast(tank.team==='blue'? 'Blauer Panzer zerstoert!' : 'Roter Panzer zerstoert!');
    const idx=obstacles.indexOf(tank.obstacle); if(idx>=0) obstacles.splice(idx,1); }
}
function hitTank(b,tank){
  if(!tank.alive||b.team===tank.team) return false;
  const dx=b.mesh.position.x-tank.x, dz=b.mesh.position.z-tank.z, y=b.mesh.position.y;
  return Math.abs(dx)<3&&Math.abs(dz)<4.5&&y>0&&y<4;
}
/* ======================================================================
   MATCH
   ====================================================================== */
function resetMatch(){
  state.score={blue:0,red:0}; state.time=0; state.shake=0; player.kills=player.deaths=player.streak=player.bestStreak=0; player.hp=100; player.alive=true; player.invincible=2; player.weapon='ak'; player.mag=30; player.reloading=0; player.x=0; player.z=40; player.faceYaw=Math.PI; cam.yaw=0; cam.pitch=.12; camPos.set(0,8,52); player.mesh.visible=true;
  bots.forEach(b=>{ b.alive=true; b.hp=100; b.invincible=1.5; const s=teamSpawn(b.team,b.spawnIndex); b.x=s.x; b.z=s.z; b.path=[]; b.mesh.visible=true; b.mesh.position.set(b.x,0,b.z); });
  for(const b of bullets){ scene.remove(b.mesh); bulletPool.push(b.mesh); } bullets.length=0;
  for(const d of decals) scene.remove(d.g); decals.length=0; for(const b of bombs) scene.remove(b.m); bombs.length=0;
  if(heli.active){ heli.active=false; heli.mesh.visible=false; Audio.heliStop(); }
  if(nuke.group){ scene.remove(nuke.group); nuke.group=null; } nuke.active=false; UI.flash.style.opacity=0;
  // Alte Panzer entfernen und neue spawnen
  for(const t of tanks){ scene.remove(t.mesh); const oi=obstacles.indexOf(t.obstacle); if(oi>=0) obstacles.splice(oi,1); }
  tanks.length=0; spawnTank('blue'); spawnTank('red');
  UI.feedEl.innerHTML=''; UI.center.hidden=true; UI.hideCross(false); UI.score(); UI.streak(); UI.weapon(); UI.status(); UI.toast('');
}
function endMatch(win,reason){
  if(state.phase!=='play') return; state.phase='end'; if(document.pointerLockElement) document.exitPointerLock();
  const t=$('endTitle'); t.textContent= win?'Sieg':'Niederlage'; t.className='end-result '+(win?'win':'lose');
  $('endText').textContent= reason? `${reason}. Endstand ${state.score.blue} : ${state.score.red}.` : `Endstand Blau ${state.score.blue} : ${state.score.red} Rot.`;
  $('stKills').textContent=player.kills; $('stDeaths').textContent=player.deaths; $('stStreak').textContent=player.bestStreak;
  input.fire=false; Audio.heliStop();
  setTimeout(()=>{ $('endScreen').hidden=false; UI.hud.hidden=true; $('touch').hidden=true; },900);
}
function startMatch(){
  Audio.init(); Audio.resume(); Audio.enabled=$('optSound').checked; state.splash=$('optSplash').checked; state.assist=$('optAssist').checked; state.sens=+$('optSens').value;
  Q=quality[$('optQuality').value]; renderer.setPixelRatio(Math.min(devicePixelRatio,Q.px)); renderer.shadowMap.enabled=Q.shadowOn; sun.shadow.mapSize.set(Q.shadow,Q.shadow); sun.shadow.map&&sun.shadow.map.dispose(); sun.shadow.map=null;
  scene.traverse(o=>{ if(o.material) o.material.needsUpdate=true; });
  resetMatch(); state.phase='play'; $('startScreen').hidden=true; $('endScreen').hidden=true; UI.hud.hidden=false; $('touch').hidden=!isTouch; $('goalN').textContent=GOAL;
  if(!isTouch){ $('hint').textContent='Klick ins Spiel, um die Maus zu binden'; $('hint').classList.add('show'); canvas.requestPointerLock?.(); }
  UI.toast('Gefecht läuft');
}
$('btnStart').addEventListener('click',startMatch); $('btnAgain').addEventListener('click',startMatch);
$('btnFull').addEventListener('click',()=>{ const el=document.documentElement; (el.requestFullscreen||el.webkitRequestFullscreen)?.call(el); screen.orientation?.lock?.('landscape').catch(()=>{}); });
$('ctrlDesktop').hidden=isTouch; $('ctrlTouch').hidden=!isTouch; if(isTouch) $('btnFull').textContent='Vollbild (empfohlen)';
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ input.keys={}; input.fire=false; } else Audio.resume(); });

/* ======================================================================
   SCHLEIFE
   ====================================================================== */
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
renderer.setPixelRatio(Math.min(devicePixelRatio,Q.px)); renderer.setSize(innerWidth,innerHeight);
camera.position.set(0,18,48); camPos.copy(camera.position);
let last=performance.now(), hudT=0;
function frame(now){
  requestAnimationFrame(frame); const dt=Math.min((now-last)/1000,.05); last=now; state.time+=dt;
  if(state.phase==='play'||state.phase==='end'){
    if(state.phase==='play'){ updatePlayer(dt); updateBots(dt); updateTanks(dt); updateWeaponSwitch(dt); }
    updateBullets(dt); updateEffects(dt); updateHeli(dt); updateBombs(dt); updateNuke(dt); updateCamera(dt);
    hudT+=dt; if(hudT>.1){ hudT=0; const low=Math.max(0,Math.min(1,(45-player.hp)/35)); const hurt=Math.max(0,Math.min(1,1-(state.time-player.lastHit)/.6)); UI.vignette.style.opacity=Math.max(low*.9,hurt*.8); if(UI.hurtDirT>0){ UI.hurtDirT-=.1; if(UI.hurtDirT<=0) UI.hurtDir.style.opacity=0; else UI.hurtDir.style.opacity=UI.hurtDirT*2; } }
  } else { menuCamera(dt); updateEffects(dt); bots.forEach(b=>animateCharacter(b.mesh,false,dt)); }
  if(!state.noRender) renderer.render(scene,camera);
}
requestAnimationFrame(frame);
if(location.hash==='#test'){ state.noRender=true; window.__game={state,player,bots,cam,input,weapons,heli,nuke,renderer,scene,camera,selectWeapon,reload,callHeli,launchNuke,startMatch}; }
