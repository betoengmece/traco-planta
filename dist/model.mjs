import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { bounds, clamp, heading, interval, joinedWallCaps, length } from './geometry.mjs';
import { houseOutline } from './template.mjs';
import { surveyOutline } from './survey.mjs?v=20261122-janela-cozinha';

import { canStand, eyeHeight, walkBarriers, walkSpawn, walkStep } from './walk.mjs';
import { createGardenView } from './garden-view.mjs';
import { livingRoomFurniture } from './living-room.mjs?v=20261122-moveis';
import { interiorLayout } from './interior-layout.mjs?v=20261122-banheiros';
import { makeInterior } from './interior-model.mjs?v=20261122-banheiros';
import { siteExterior } from './site-exterior.mjs';
import { makeExterior } from './exterior-model.mjs';

const observerDistance=2.10;
const bathTiles={
  bathPattern:{finish:'bathCream',height:1.15,walls:['strip-side','right-strip','strip-top','rear-entry']},
  bathClay:{finish:'bathBlue',height:1.10,walls:['annex-upper','annex-lower','right-annex','annex-top','annex-bottom']}
};

export function createModel(host, onZoom) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8efe9');
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .05, 240);
  const eyeCamera=new THREE.PerspectiveCamera(56,1,.035,80);
  eyeCamera.rotation.order='YXZ';
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label','Vista 3D interativa da planta');
  host.append(renderer.domElement);

  const controls = new OrbitControls(camera,renderer.domElement);
  controls.maxPolarAngle = Math.PI*.49;
  controls.minZoom = .15;
  controls.maxZoom = 12;
  controls.enableDamping = true;
  const assembly = new THREE.Group();
  scene.add(assembly);
  scene.add(new THREE.HemisphereLight('#ffffff','#a5b5ad',2.05));
  const sun = new THREE.DirectionalLight('#fff6e5',2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.bias = -.0005;
  sun.shadow.normalBias = .018;
  scene.add(sun,sun.target);

  const mats = {
    wall:new THREE.MeshStandardMaterial({color:'#e7e3d8',roughness:.85}),
    frame:new THREE.MeshStandardMaterial({color:'#4f463b',roughness:.55}),
    door:new THREE.MeshStandardMaterial({color:'#694735',roughness:.74}),
    glass:new THREE.MeshStandardMaterial({color:'#78c6c9',transparent:true,opacity:.38,roughness:.16,depthWrite:false}),
    floor:new THREE.MeshStandardMaterial({color:'#c8bc9f',roughness:.9,side:THREE.DoubleSide}),
    base:new THREE.MeshStandardMaterial({color:'#dce7dd',roughness:1})
  };
  const unitBox = new THREE.BoxGeometry(1,1,1);
  function floorSlab(outline) {
    const geometry=new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,-y))));
    geometry.rotateX(-Math.PI/2);
    const slab=new THREE.Mesh(geometry,mats.floor);
    slab.position.y=-.018;
    slab.receiveShadow=true;
    return slab;
  }
  const slabs={house:floorSlab(houseOutline),survey:floorSlab(surveyOutline)};
  const background = new THREE.Mesh(unitBox,mats.base);
  background.receiveShadow=true;
  scene.add(background);
  let box = null;
  let houseBox = null;
  let exterior = null;
  let grid = null;
  let frame = 0;
  let frameSpan = 10;
  let lastZoom = camera.zoom;
  let kitchenStart=null;
  let walking=false;
  let hasWalkPosition=false;
  let barriers=[];
  let forward=0;
  let sideways=0;
  let previousFrame=null;
  const garden=createGardenView();
  const interior=makeInterior();
  const exteriorModel=makeExterior(interior);
  const ceiling=new THREE.Group();
  const finishes=new THREE.Group();
  const upholstery=new THREE.MeshStandardMaterial({color:'#a6ad92',roughness:.97});
  const cushion=new THREE.MeshStandardMaterial({color:'#b7bea4',roughness:.97});
  const feet=new THREE.MeshStandardMaterial({color:'#6e4e36',roughness:.8});
  const tvFrame=new THREE.MeshStandardMaterial({color:'#252c2c',roughness:.71});
  const screen=new THREE.MeshStandardMaterial({color:'#121a20',roughness:.28,metalness:.18});
  const observer=createObserver();
  scene.add(observer);

  function createObserver() {
    const figure=new THREE.Group();
    figure.visible=false;
    const jersey=new THREE.MeshStandardMaterial({color:'#087f70',roughness:.82});
    const trousers=new THREE.MeshStandardMaterial({color:'#223d48',roughness:.85});
    const skin=new THREE.MeshStandardMaterial({color:'#d89d74',roughness:.9});
    const sphere=new THREE.SphereGeometry(1,16,12);
    const joints=new THREE.CapsuleGeometry(1,2,6,12);
    function part(geometry,material,x,y,z,sx,sy,sz,tilt=0) {
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(x,y,z);
      mesh.scale.set(sx,sy,sz);
      mesh.rotation.z=tilt;
      figure.add(mesh);
    }
    part(sphere,jersey,0,1.23,0,.205,.33,.126);
    part(sphere,skin,0,1.62,0,.103,.128,.105);
    part(sphere,skin,0,eyeHeight,.10,.032,.029,.037);
    for (const side of [-1,1]) {
      part(joints,jersey,side*.212,1.10,0,.064,.135,.064,side*.14);
      part(sphere,skin,side*.247,.84,0,.052,.074,.053);
      part(joints,trousers,side*.092,.46,0,.08,.219,.081);
      part(sphere,trousers,side*.092,.068,.059,.081,.068,.163);
    }
    const marker=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,.032,.32),.53,0x087f70,.19,.16);
    figure.add(marker);
    return figure;
  }

  function addKitchenView(group, opening, wall, center) {
    const z=wall.thickness/2;
    const height=opening.sill+opening.height/2;
    garden.mesh.position.set(center,height,-z-.018);
    group.add(garden.mesh);
    garden.setOpening(opening.width,opening.height,eyeHeight-height,observerDistance+wall.thickness+.018);
    kitchenStart={
      position:group.localToWorld(new THREE.Vector3(center,eyeHeight,z+observerDistance)),
      target:group.localToWorld(new THREE.Vector3(center,height,0))
    };
  }

  function updateObserver() {
    observer.visible=hasWalkPosition && !walking;
    observer.position.set(eyeCamera.position.x,0,eyeCamera.position.z);
    observer.rotation.y=eyeCamera.rotation.y+Math.PI;
  }

  function placeWalker(atKitchen) {
    const position=kitchenStart?.position;
    if (atKitchen && position && canStand(position.x,position.z,barriers)) {
      eyeCamera.position.copy(position);
      eyeCamera.lookAt(kitchenStart.target);
    } else {
      const spawn=walkSpawn(houseBox,barriers);
      eyeCamera.position.set(spawn.x,eyeHeight,spawn.y);
      if (atKitchen && kitchenStart) eyeCamera.lookAt(kitchenStart.target);
      else eyeCamera.rotation.set(0,0,0);
    }
    hasWalkPosition=true;
  }

  function setWalking(active, destination=false) {
    if (!box) return;
    if (active && (destination || !hasWalkPosition)) {
      if (destination==='garage' && exterior) {
        const {garageStart,garageTarget}=exterior;
        eyeCamera.position.set(garageStart.x,eyeHeight,garageStart.y);
        eyeCamera.lookAt(garageTarget.x,eyeHeight,garageTarget.y);
        hasWalkPosition=true;
      } else placeWalker(Boolean(kitchenStart));
      eyeCamera.zoom=1;
      eyeCamera.updateProjectionMatrix();
    }
    walking=active;
    ceiling.visible=walking;
    controls.enabled=!active;
    forward=sideways=0;
    updateObserver();
    onZoom(walking ? eyeCamera.zoom : camera.zoom);
  }

  function lookWalk(dx,dy) {
    if (!walking) return;
    eyeCamera.rotation.y-=dx*.004;
    eyeCamera.rotation.x=clamp(eyeCamera.rotation.x-dy*.004,-1.35,1.35);
  }

  function moveWalker(delta) {
    const magnitude=Math.hypot(forward,sideways);
    if (!magnitude) return;
    const distance=delta*1.7/Math.max(1,magnitude);
    const yaw=eyeCamera.rotation.y;
    const dx=(sideways*Math.cos(yaw)-forward*Math.sin(yaw))*distance;
    const dy=(-sideways*Math.sin(yaw)-forward*Math.cos(yaw))*distance;
    const next=walkStep({x:eyeCamera.position.x,y:eyeCamera.position.z},dx,dy,barriers,box);
    eyeCamera.position.x=next.x;
    eyeCamera.position.z=next.y;
  }

  function solid(parent, x, y, z, w, h, d, material) {
    if (w<.00001 || h<.00001 || d<.00001) return;
    const mesh = new THREE.Mesh(unitBox,material);
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    mesh.receiveShadow = true;
    mesh.castShadow = material!==mats.glass && material!==mats.floor;
    parent.add(mesh);
  }

  function addLivingRoom(project) {
    const furniture=livingRoomFurniture(project);
    if (!furniture) return;
    const {sofa,tv}=furniture;
    const group=new THREE.Group();
    group.name='Sala com sofá e TV de 50 polegadas';
    assembly.add(group);
    const {x,y,width,depth}=sofa;
    solid(group,x,.23,y,width,.29,depth,upholstery);
    solid(group,x,.61,y+depth/2-.09,width,.42,.18,upholstery);
    for (const side of [-1,1]) {
      solid(group,x+side*(width/2-.065),.49,y,.13,.29,depth-.04,upholstery);
      solid(group,x+side*(width/2-.12),.055,y-.30,.065,.11,.06,feet);
      solid(group,x+side*(width/2-.12),.055,y+.30,.065,.11,.06,feet);
      const seatWidth=(width-.30)/2;
      solid(group,x+side*seatWidth/2,.408,y-.077,seatWidth-.013,.13,.63,cushion);
      solid(group,x+side*seatWidth/2,.655,y+.251,seatWidth-.016,.38,.12,cushion);
    }
    solid(group,tv.x,tv.elevation,tv.y,tv.width+.036,tv.height+.043,.049,tvFrame);
    solid(group,tv.x,tv.elevation,tv.y+.026,tv.width,tv.height,.007,screen);
    barriers.push({x:sofa.x,y:sofa.y,ux:1,uy:0,half:sofa.depth/2,start:-sofa.width/2,end:sofa.width/2});
  }

  function addBathroomTiles(project,room,tiles) {
    const cx=(room.left+room.right)/2;
    const cy=(room.top+room.bottom)/2;
    for (const wall of project.walls.filter(wall=>tiles.walls.includes(wall.id))) {
      const angle=heading(wall);
      const ux=Math.cos(angle),uy=Math.sin(angle);
      const sign=Math.sign((cy-wall.a.y)*ux-(cx-wall.a.x)*uy);
      const height=Math.min(tiles.height,wall.height);
      const depth=sign*(wall.thickness/2+.002);
      const projectAlong=(x,y)=>(x-wall.a.x)*ux+(y-wall.a.y)*uy;
      const corners=[projectAlong(room.left,room.top),projectAlong(room.right,room.top),
        projectAlong(room.left,room.bottom),projectAlong(room.right,room.bottom)];
      const startAt=Math.max(0,Math.min(...corners));
      const endAt=Math.min(length(wall),Math.max(...corners));
      const holes=project.openings.filter(opening=>opening.wallId===wall.id && opening.sill<height)
        .map(opening=>({opening,span:interval(opening,wall)}))
        .sort((a,b)=>a.span[0]-b.span[0]);
      function panel(from,to,bottom,top) {
        from=Math.max(from,startAt);
        to=Math.min(to,endAt);
        if (to<=from || top<=bottom) return;
        const width=to-from,span=top-bottom;
        const center=(from+to)/2;
        const geometry=new THREE.PlaneGeometry(width,span);
        const uv=geometry.attributes.uv;
        for (let i=0;i<uv.count;i++) {
          uv.setXY(i,(sign>0 ? from : -to)+uv.getX(i)*width,bottom+uv.getY(i)*span);
        }
        const mesh=new THREE.Mesh(geometry,interior.finish(tiles.finish));
        mesh.name='Azulejos do '+room.name.toLowerCase();
        mesh.position.set(wall.a.x+ux*center-uy*depth,(bottom+top)/2,wall.a.y+uy*center+ux*depth);
        mesh.rotation.y=-angle+(sign<0 ? Math.PI : 0);
        mesh.receiveShadow=true;
        finishes.add(mesh);
      }
      let from=startAt;
      for (const {opening,span:[start,end]} of holes) {
        panel(from,start,0,height);
        panel(start,end,0,opening.sill);
        panel(start,end,opening.sill+opening.height,height);
        from=end;
      }
      panel(from,endAt,0,height);
    }
  }

  function addInteriors(project) {
    for (const group of [ceiling,finishes]) {
      for (const surface of group.children) surface.geometry.dispose();
      group.clear();
      assembly.add(group);
    }
    const {rooms,items}=interiorLayout(project);
    for (const room of rooms) {
      finishes.add(interior.roomSurface(room,false));
      ceiling.add(interior.roomSurface(room,true));
      if (Object.hasOwn(bathTiles,room.finish)) addBathroomTiles(project,room,bathTiles[room.finish]);
    }
    for (const item of items) {
      assembly.add(interior.furnishing(item,solid));
      if (item.blocks) {
        const ux=Math.cos(item.rotation*Math.PI/2);
        const uy=-Math.sin(item.rotation*Math.PI/2);
        barriers.push({x:item.x,y:item.y,ux,uy,half:item.depth/2,start:-item.width/2,end:item.width/2});
      }
    }
    ceiling.visible=walking;
  }

  function fillWall(group,start,end,bottom,top,thickness) {
    solid(group,(start+end)/2,(bottom+top)/2,0,end-start,top-bottom,thickness,mats.wall);
  }

  function addOpening(group, opening, wall, start, end, kitchenWindow) {
    const width=end-start;
    const center=(start+end)/2;
    const head=opening.sill+opening.height;
    const trim=Math.min(.034,width*.07);
    const depth=wall.thickness*1.025;
    for (const edge of [start+trim/2,end-trim/2]) {
      solid(group,edge,opening.sill+opening.height/2,0,trim,opening.height,depth,mats.frame);
    }
    solid(group,center,head-trim/2,0,width,trim,depth,mats.frame);
    if (opening.type==='window') {
      solid(group,center,opening.sill+trim/2,0,width,trim,depth,mats.frame);
      if (kitchenWindow) {
        for (const fraction of [.25,.5,.75]) {
          solid(group,start+width*fraction,opening.sill+opening.height/2,0,trim,opening.height-.02,.043,mats.frame);
        }
        addKitchenView(group,opening,wall,center);
      } else if (opening.casement) {
        const leaf=width*.45;
        const y=opening.sill+opening.height/2;
        const height=opening.height-2*trim;
        for (const x of [start+width*.05,end-width*.05]) {
          const z=opening.side*leaf/2;
          solid(group,x,y,z,.027,height,leaf,mats.glass);
          solid(group,x,y,opening.side*leaf,trim,height,trim,mats.frame);
          solid(group,x,y+height/2,z,trim,trim,leaf,mats.frame);
          solid(group,x,y-height/2,z,trim,trim,leaf,mats.frame);
        }
      } else {
        solid(group,center,opening.sill+opening.height/2,0,width-2*trim,opening.height-2*trim,.025,mats.glass);
        solid(group,center,opening.sill+opening.height/2,0,trim,opening.height-.02,.043,mats.frame);
      }
      return;
    }
    const leafWidth=width-2*trim;
    const hinge=opening.hinge==='start' ? start+trim : end-trim;
    const leafDepth=.044;
    solid(group,hinge,(head-trim)/2,opening.side*leafWidth/2,leafDepth,head-trim,leafWidth,mats.door);
  }

  function addWall(wall,openings,walls,kitchenWindow) {
    const caps=joinedWallCaps(wall,walls);
    const group=new THREE.Group();
    group.position.set(wall.a.x,0,wall.a.y);
    group.rotation.y=-heading(wall);
    assembly.add(group);
    let position=-caps.a;
    for (const opening of openings.sort((a,b)=>a.t-b.t)) {
      const [start,end]=interval(opening,wall);
      fillWall(group,position,start,0,wall.height,wall.thickness);
      fillWall(group,start,end,0,opening.sill,wall.thickness);
      fillWall(group,start,end,opening.sill+opening.height,wall.height,wall.thickness);
      addOpening(group,opening,wall,start,end,opening===kitchenWindow);
      position=end;
    }
    fillWall(group,position,length(wall)+caps.b,0,wall.height,wall.thickness);
  }

  function setProject(project) {
    houseBox=bounds(project);
    box=houseBox;
    exterior?.group.traverse(mesh=>{ if (mesh.userData.exteriorSurface) mesh.geometry.dispose(); });
    exterior=null;
    garden.mesh.removeFromParent();
    assembly.clear();
    kitchenStart=null;
    barriers=walkBarriers(project);
    const kitchenWindow=project.openings.find(opening =>
      opening.wallId==='right-main' && opening.id==='window-2' && opening.type==='window');
    project.walls.forEach(wall =>
      addWall(wall,project.openings.filter(opening=>opening.wallId===wall.id),project.walls,kitchenWindow));
    addLivingRoom(project);
    addInteriors(project);
    const site=siteExterior(project);
    if (site) {
      exterior=exteriorModel.create(site,houseBox,project.walls.find(wall=>wall.id==='bottom-left'));
      assembly.add(exterior.group);
      barriers.push(...exterior.barriers);
      box=exterior.bounds;
    }
    const {x,z}=eyeCamera.position;
    const outside=x<box.x-2 || x>box.x+box.width+2 || z<box.y-2 || z>box.y+box.depth+2;
    if ((hasWalkPosition && (outside || !canStand(x,z,barriers))) || (!hasWalkPosition && kitchenStart)) {
      placeWalker(Boolean(kitchenStart));
    }
    updateObserver();
    if (Object.hasOwn(slabs,project.template)) assembly.add(slabs[project.template]);
    const span=Math.max(box.width,box.depth);
    const cx=box.x+box.width/2;
    const cz=box.y+box.depth/2;
    const gridSize=Math.ceil(Math.max(24,span*2.3));
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid=new THREE.GridHelper(gridSize,Math.min(gridSize,180),'#aabfb1','#c8d8cc');
    grid.position.set(cx,-.051,cz);
    scene.add(grid);
    background.position.set(cx,-.12,cz);
    background.scale.set(gridSize*8,.12,gridSize*8);
    sun.position.set(cx+span,span*1.7,cz+span*.65);
    sun.target.position.set(cx,0,cz);
    const range=span*.88+4;
    Object.assign(sun.shadow.camera,{left:-range,right:range,top:range,bottom:-range,far:span*5+25});
    sun.shadow.camera.updateProjectionMatrix();
  }

  function resize() {
    const width=host.clientWidth;
    const height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height;
    camera.left=-frameSpan*aspect/2;
    camera.right=frameSpan*aspect/2;
    camera.top=frameSpan/2;
    camera.bottom=-frameSpan/2;
    camera.updateProjectionMatrix();
    eyeCamera.aspect=aspect;
    eyeCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(28))*Math.max(1,.72/aspect)));
    eyeCamera.updateProjectionMatrix();
    renderer.setSize(width,height);
  }

  function fit() {
    if (walking) {
      eyeCamera.zoom=1;
      eyeCamera.updateProjectionMatrix();
      onZoom(eyeCamera.zoom);
      return;
    }
    if (!box) return;
    const cx=box.x+box.width/2;
    const cy=box.y+box.depth/2;
    const span=Math.max(box.width,box.depth);
    const aspect=host.clientWidth/Math.max(1,host.clientHeight);
    frameSpan=(Math.hypot(box.width,box.depth)*.97+2)/Math.min(1,Math.max(.2,aspect));
    controls.target.set(cx,.8,cy);
    camera.position.set(cx+span*.93,span*.94+1.6,cy+span);
    camera.zoom=1;
    controls.update();
    resize();
    onZoom(camera.zoom);
  }

  function tick(time) {
    frame=requestAnimationFrame(tick);
    const delta=previousFrame===null ? 0 : clamp((time-previousFrame)/1000,0,.05);
    previousFrame=time;
    if (walking) moveWalker(delta);
    else controls.update();
    const activeCamera=walking ? eyeCamera : camera;
    if (lastZoom!==activeCamera.zoom) {
      lastZoom=activeCamera.zoom;
      onZoom(lastZoom);
    }
    renderer.render(scene,activeCamera);
  }

  return {
    setProject, fit, resize, setWalking, lookWalk, setKitchenPhoto: garden.setPhoto,
    setWalkInput(nextForward,nextSideways) { forward=nextForward; sideways=nextSideways; },
    get hasExterior() { return Boolean(exterior); },
    get hasKitchenView() { return Boolean(kitchenStart); },
    get walking() { return walking; },
    get zoom() { return walking ? eyeCamera.zoom : camera.zoom; },
    changeZoom(factor) {
      const activeCamera=walking ? eyeCamera : camera;
      activeCamera.zoom=clamp(activeCamera.zoom*factor,walking ? .8 : controls.minZoom,walking ? 2.5 : controls.maxZoom);
      activeCamera.updateProjectionMatrix();
    },
    resume() { if (!frame) frame=requestAnimationFrame(tick); },
    pause() {
      cancelAnimationFrame(frame);
      frame=0;
      previousFrame=null;
      forward=sideways=0;
    }
  };
}
