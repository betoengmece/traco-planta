import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { bounds, clamp, heading, interval, joinedWallCaps, length } from './geometry.mjs';
import { houseOutline } from './template.mjs';
import { surveyOutline } from './survey.mjs?v=20261122-sala';

export function createModel(host, onZoom) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8efe9');
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .05, 240);
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
    wall:new THREE.MeshStandardMaterial({color:'#c7d5cd',roughness:.85}),
    frame:new THREE.MeshStandardMaterial({color:'#25493e',roughness:.55}),
    door:new THREE.MeshStandardMaterial({color:'#bd916b',roughness:.74}),
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
  let grid = null;
  let frame = 0;
  let frameSpan = 10;
  let lastZoom = camera.zoom;

  function solid(parent, x, y, z, w, h, d, material) {
    if (w<.00001 || h<.00001 || d<.00001) return;
    const mesh = new THREE.Mesh(unitBox,material);
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    mesh.receiveShadow = true;
    mesh.castShadow = material!==mats.glass && material!==mats.floor;
    parent.add(mesh);
  }

  function fillWall(group,start,end,bottom,top,thickness) {
    solid(group,(start+end)/2,(bottom+top)/2,0,end-start,top-bottom,thickness,mats.wall);
  }

  function addOpening(group, opening, wall, start, end) {
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
      if (opening.casement) {
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

  function addWall(wall,openings,walls) {
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
      addOpening(group,opening,wall,start,end);
      position=end;
    }
    fillWall(group,position,length(wall)+caps.b,0,wall.height,wall.thickness);
  }

  function setProject(project) {
    box=bounds(project);
    assembly.clear();
    project.walls.forEach(wall => addWall(wall,project.openings.filter(opening=>opening.wallId===wall.id),project.walls));
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
    renderer.setSize(width,height);
  }

  function fit() {
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

  function tick() {
    frame=requestAnimationFrame(tick);
    controls.update();
    if (lastZoom!==camera.zoom) {
      lastZoom=camera.zoom;
      onZoom(lastZoom);
    }
    renderer.render(scene,camera);
  }

  return {
    setProject, fit, resize,
    get zoom() { return camera.zoom; },
    changeZoom(factor) {
      camera.zoom=clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);
      camera.updateProjectionMatrix();
    },
    resume() { if (!frame) tick(); },
    pause() { cancelAnimationFrame(frame); frame=0; }
  };
}
