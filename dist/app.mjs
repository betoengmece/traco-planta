import { bounds, changeWallThickness, clamp, distance, heading, interval, joinedWallCaps, legacyExampleProject, length, nearestWall, placeOpening, pointAt, validateOpening, withWallThickness } from './geometry.mjs';
import { icon, renderIcons } from './icons.mjs';
import { defaultProject, houseOutline } from './template.mjs';
import { resizeWindowType, withWindowTypes } from './window-types.mjs';
import { minimumWallLength, moveWallEndpoint, snapWallPoint, straightenedEnd, stretchPoint } from './wall-edit.mjs';

const $ = id => document.getElementById(id);
const plan = $('plan');
const stage = $('stage');
const context = plan.getContext('2d');
const storageKey = 'traco-planta-v1';
const unit = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const tools = {
  select: ['Selecionar', 'Clique em uma parede, porta ou janela para editar.'],
  wall: ['Parede', 'Clique no início e depois no fim de cada parede. Esc encerra.'],
  door: ['Porta', 'Clique sobre uma parede para encaixar a porta.'],
  window: ['Janela', 'Clique sobre uma parede para encaixar a janela.'],
  pan: ['Mover vista', 'Arraste para mover a planta. Role para ampliar ou reduzir.']
};
const messages = {
  door: 'Escolha um trecho livre da parede com espaço para a porta.',
  window: 'Escolha um trecho livre da parede com espaço para a janela.'
};
const shortNames = { wall: 'Parede', door: 'Porta', window: 'Janela' };
let project = prepareProject(restore());
let windowTypeId = 'sliding';
let itemsOpen = false;
let itemsTab = 'placed';
const expandedGroups = new Set();
const placementTools = ['wall','door','window'];
const placementDefaults = {
  wall:{length:null,thicknessOverride:null,height:2.7},
  door:{width:.86,height:2.1,sill:0,hinge:'start',side:1}
};
const hingeOptions = [['start','Lado 1'],['end','Lado 2']];
const swingOptions = [[1,'Um lado da parede'],[-1,'Outro lado da parede']];
let placementPropertiesOpen = false;
let tool = 'select';
let view = 'plan';
let selected = null;
let start = null;
let hover = null;
let preview = null;
let dragging = null;
let wallDrag = null;
let openingDrag = null;
let magnetism = true;
let model = null;
let viewChange = 0;
let size = { width: 1, height: 1 };
let camera = { x: 0, y: 0, scale: 56, base: 56 };
let fitted = false;
const past = [];
const future = [];
renderIcons();

function prepareProject(value) { return withWindowTypes(withWallThickness(value)); }

function placementThickness() {
  return placementDefaults.wall.thicknessOverride ?? project.wallThickness;
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved.name === 'string' && Array.isArray(saved.walls) && Array.isArray(saved.openings)) {
      // Upgrade only the untouched example that the previous release saved on first visit.
      if (saved.example === true && JSON.stringify(saved) === JSON.stringify(legacyExampleProject())) return defaultProject();
      return saved;
    }
  } catch {}
  return defaultProject();
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(project));
    $('save-status').innerHTML = icon('check') + ' Salvo neste navegador';
  } catch {
    $('save-status').textContent = 'Armazenamento indisponível';
  }
}

function commit(change, { structure = false, update = true } = {}) {
  past.push(structuredClone(project));
  if (past.length > 100) past.shift();
  future.length = 0;
  change();
  if (structure) {
    delete project.template;
    delete project.example;
  }
  persist();
  if (update) refresh();
}

function history(from, to) {
  if (!from.length) return;
  to.push(project);
  project = from.pop();
  placementDefaults.wall.thicknessOverride=null;
  selected = start = hover = preview = wallDrag = openingDrag = null;
  persist();
  refresh();
}

const screen = p => ({ x: size.width / 2 + (p.x - camera.x) * camera.scale, y: size.height / 2 + (p.y - camera.y) * camera.scale });
const world = p => ({ x: camera.x + (p.x - size.width / 2) / camera.scale, y: camera.y + (p.y - size.height / 2) / camera.scale });

function fitPlan() {
  const box = bounds(project);
  const scale = clamp(Math.min((size.width - 64) / box.width, (size.height - 82) / box.depth), 10, 135);
  camera = { x: box.x + box.width / 2, y: box.y + box.depth / 2, scale, base: scale };
  fitted = true;
  draw();
}

function resize() {
  size = { width: stage.clientWidth, height: stage.clientHeight };
  if (!size.width || !size.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  plan.width = Math.round(size.width * dpr);
  plan.height = Math.round(size.height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!fitted) fitPlan();
  else draw();
  model?.resize();
}

function zoomPlan(factor, anchor = { x: size.width / 2, y: size.height / 2 }) {
  const before = world(anchor);
  camera.scale = clamp(camera.scale * factor, 8, 380);
  const after = world(anchor);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
  draw();
}

function stroke(x, y, toX, toY) {
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(toX, toY);
  context.stroke();
}

function grid() {
  const left = world({x:0,y:0});
  const right = world({x:size.width,y:size.height});
  const step = camera.scale >= 61 ? .2 : camera.scale >= 28 ? .25 : camera.scale >= 13 ? .5 : 1;
  context.lineWidth = 1;
  for (let n = Math.floor(left.x / step); n <= Math.ceil(right.x / step); n++) {
    const x = Math.round(screen({x:n*step,y:0}).x) + .5;
    context.strokeStyle = Math.abs(n * step - Math.round(n * step)) < .001 ? '#d4e3d8' : '#e8efe9';
    stroke(x, 0, x, size.height);
  }
  for (let n = Math.floor(left.y / step); n <= Math.ceil(right.y / step); n++) {
    const y = Math.round(screen({x:0,y:n*step}).y) + .5;
    context.strokeStyle = Math.abs(n * step - Math.round(n * step)) < .001 ? '#d4e3d8' : '#e8efe9';
    stroke(0, y, size.width, y);
  }
}

function paintFootprint() {
  if (project.template !== 'house') return;
  context.beginPath();
  houseOutline.forEach(([x,y],index) => {
    const point = screen({x,y});
    if (index === 0) context.moveTo(point.x,point.y);
    else context.lineTo(point.x,point.y);
  });
  context.closePath();
  context.fillStyle = '#e9f1e9';
  context.fill();
}

function inWallFrame(wall, paint) {
  const a = screen(wall.a);
  context.save();
  context.translate(a.x, a.y);
  context.rotate(heading(wall));
  paint(length(wall) * camera.scale, wall.thickness * camera.scale);
  context.restore();
}

function paintWall(wall, walls, ghost = false) {
  const caps=joinedWallCaps(wall,walls);
  inWallFrame(wall, (width, thickness) => {
    const active = selected?.id === wall.id;
    thickness = Math.max(3, thickness);
    context.fillStyle = ghost ? '#52ac8a96' : active ? '#21866a' : '#25493e';
    context.fillRect(-caps.a*camera.scale,-thickness/2,width+(caps.a+caps.b)*camera.scale,thickness);
  });
}

function paintSwing(hingeX, width, hinge, side) {
  const startAngle = hinge === 'start' ? 0 : Math.PI;
  const endAngle = side * Math.PI / 2;
  stroke(hingeX, 0, hingeX, side * width);
  context.beginPath();
  context.arc(hingeX, 0, width, startAngle, endAngle, (hinge === 'start') === (side < 0));
  context.stroke();
}

function paintOpening(opening, ghost = false, walls = project.walls) {
  const wall = walls.find(w => w.id === opening.wallId);
  if (!wall) return;
  inWallFrame(wall, (wallLength, thickness) => {
    thickness = Math.max(3, thickness);
    const width = opening.width * camera.scale;
    const x = opening.t * wallLength - width/2;
    const active = selected?.id === opening.id;
    const color = active ? '#117453' : opening.type === 'door' ? '#537b66' : '#3b8d82';
    const y = thickness / 2;
    if (ghost) context.globalAlpha = .66;
    context.fillStyle = opening.type === 'door' ? '#f6faf6' : '#beebe1';
    context.fillRect(x, -y, width, thickness);
    context.strokeStyle = color;
    context.lineWidth = active ? 2.5 : 1.5;
    stroke(x, -y, x, y);
    stroke(x+width, -y, x+width, y);
    if (opening.type === 'window') {
      stroke(x, -y, x+width, -y);
      stroke(x, y, x+width, y);
      stroke(x, 0, x+width, 0);
      if (opening.casement) {
        paintSwing(x + width*.05, width*.45, 'start', opening.side);
        paintSwing(x + width*.95, width*.45, 'end', opening.side);
      }
      return;
    }
    paintSwing(opening.hinge === 'start' ? x : x + width, width, opening.hinge, opening.side);
  });
}

function wallMeasure(wall, offset = 25) {
  if (camera.scale < 21) return;
  inWallFrame(wall, width => {
    if (width < 30) return;
    const y = -offset;
    context.strokeStyle = '#78978a';
    context.fillStyle = '#3d6054';
    context.lineWidth = .9;
    stroke(0,y,width,y);
    stroke(0,y-6,0,y+6);
    stroke(width,y-6,width,y+6);
    context.textAlign = 'center';
    context.font = '600 13px DM Sans, sans-serif';
    const text = unit.format(length(wall)) + ' m';
    context.save();
    context.translate(width/2, y);
    const angle = heading(wall);
    if (angle > Math.PI/2 || angle < -Math.PI/2) context.rotate(Math.PI);
    context.fillText(text,0,-7);
    context.restore();
  });
}

function draw() {
  context.clearRect(0,0,size.width,size.height);
  grid();
  paintFootprint();
  const drawing = wallDrag?.change || project;
  drawing.walls.forEach(wall => paintWall(wall,drawing.walls));
  drawing.openings.forEach(opening => {
    const position = openingDrag?.next?.id===opening.id ? openingDrag.next : opening;
    paintOpening(position,false,drawing.walls);
  });
  const selectedWall = drawing.walls.find(wall => wall.id === selected?.id);
  if (selectedWall) {
    wallMeasure(selectedWall);
    for (const point of [selectedWall.a, selectedWall.b]) dot(point, '#23775f');
    if (wallDrag?.change===false) dot(wallDrag.point,'#a64736');
  } else if (project.template === 'house') {
    const box = bounds(project);
    wallMeasure({a:{x:box.x,y:box.y},b:{x:box.x+box.width,y:box.y}},24);
    wallMeasure({a:{x:box.x,y:box.y+box.depth},b:{x:box.x,y:box.y}},23);
  }
  if (tool === 'wall' && hover) {
    if (start && distance(start, hover) > .02) {
      const ghost = { id:'preview-wall',a:start,b:hover,thickness:placementThickness() };
      paintWall(ghost,drawing.walls,true);
      wallMeasure(ghost, 20);
    }
    dot(hover, '#238263');
    if (start) dot(start, '#238263');
  }
  if (preview) paintOpening(preview, true);
  if (view === 'plan') $('zoom').value = Math.round(100 * camera.scale / camera.base) + '%';
  const scale = camera.scale >= 23 ? 1 : 5;
  $('scale-bar').lastChild.textContent = scale + ' m';
  $('scale-bar').firstElementChild.style.width = scale * camera.scale + 'px';
}

function dot(point, color) {
  const p = screen(point);
  context.beginPath();
  context.fillStyle = '#f8fcf9';
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.arc(p.x,p.y,4.7,0,2*Math.PI);
  context.fill();
  context.stroke();
}

function snap(point, orthogonal) {
  const fixedLength=placementDefaults.wall.length;
  if (fixedLength!==null && start && distance(start,point)<6/camera.scale) return start;
  return snapWallPoint(point,start,project.walls,{scale:camera.scale,magnetism,orthogonal,fixedLength});
}

function endpointAt(position) {
  if (selected?.type!=='wall') return null;
  const wall=project.walls.find(candidate => candidate.id===selected.id);
  if (!wall) return null;
  const edge=distance(position,wall.a) <= distance(position,wall.b) ? 'a' : 'b';
  return distance(position,wall[edge]) <= 10/camera.scale ? {wall,edge} : null;
}

function openingAt(point,type) {
  const windowType = type==='window' ? activeWindowType() : null;
  const draft = windowType
    ? {type,typeId:windowType.id,casement:windowType.casement,width:windowType.width,height:windowType.height,sill:windowType.sill,hinge:'start',side:1}
    : {type,...placementDefaults.door};
  return placeOpening(project,draft,point,{scale:camera.scale,magnetism});
}

function hitTest(point) {
  const openings = project.openings.filter(opening => {
    const wall = project.walls.find(w => w.id === opening.wallId);
    const hit = projectWallLocal(point, wall);
    const [a,b] = interval(opening,wall);
    if (hit.x >= a-.04 && hit.x <= b+.04 && Math.abs(hit.y) < wall.thickness/2 + 8/camera.scale) return true;
    if (opening.type !== 'door') return false;
    const pivot = opening.hinge === 'start' ? a : b;
    const relativeX = (hit.x-pivot) * (opening.hinge === 'start' ? 1 : -1);
    const relativeY = hit.y * opening.side;
    return relativeX >= -.04 && relativeY >= 0 && relativeY <= opening.width+.04 &&
      (Math.abs(relativeX) < 6/camera.scale || Math.abs(Math.hypot(relativeX,relativeY)-opening.width)<7/camera.scale);
  });
  if (openings.length) return { id:openings[0].id, type:openings[0].type };
  const wall = nearestWall(point, project.walls, 11/camera.scale)?.wall;
  return wall ? {id:wall.id,type:'wall'} : null;
}

function projectWallLocal(point, wall) {
  const angle = heading(wall);
  const dx = point.x-wall.a.x;
  const dy = point.y-wall.a.y;
  return {x:dx*Math.cos(angle)+dy*Math.sin(angle),y:-dx*Math.sin(angle)+dy*Math.cos(angle)};
}

function coordinate(event) {
  const box = plan.getBoundingClientRect();
  return {x:event.clientX-box.left,y:event.clientY-box.top};
}

plan.addEventListener('pointerdown', event => {
  if (view !== 'plan' || ![0,1,2].includes(event.button)) return;
  const p = coordinate(event);
  if (tool === 'pan' || event.button !== 0) {
    dragging = { p, x:camera.x, y:camera.y };
    plan.setPointerCapture(event.pointerId);
    plan.style.cursor = 'grabbing';
    return;
  }
  if (placementTools.includes(tool)) {
    const active=document.activeElement;
    if (active?.matches('#properties [data-field]')) active.blur();
    if ($('properties').querySelector('[aria-invalid="true"]')) return;
  }
  const pos = world(p);
  if (tool === 'select') {
    const endpoint=endpointAt(pos);
    if (endpoint) {
      wallDrag={...endpoint,origin:p,point:endpoint.wall[endpoint.edge],change:null};
      plan.setPointerCapture(event.pointerId);
      plan.style.cursor='grabbing';
      return;
    }
    selected = hitTest(pos);
    if (selected && selected.type!=='wall') {
      const opening=project.openings.find(item => item.id===selected.id);
      const wall=project.walls.find(item => item.id===opening.wallId);
      openingDrag={opening,center:pointAt(wall,opening.t),origin:p,next:null};
      plan.setPointerCapture(event.pointerId);
      plan.style.cursor='grabbing';
    }
    refresh();
    return;
  }
  if (tool === 'wall') {
    const point = snap(pos, event.shiftKey);
    if (!start) { start=point; hover=point; refresh(); return; }
    if (distance(start,point)<minimumWallLength-.00001) { setHint('Escolha um ponto a pelo menos 15 cm do início.'); return; }
    const wall={id:crypto.randomUUID(),a:start,b:point,
      thickness:placementThickness(),height:placementDefaults.wall.height};
    const closes = project.walls.some(existing => distance(existing.a,point)<.001 || distance(existing.b,point)<.001);
    start = closes ? null : point;
    hover = point;
    commit(() => project.walls.push(wall), {structure:true});
    return;
  }
  const draft = openingAt(pos,tool);
  if (!draft) { setHint(messages[tool]); return; }
  const placed = { ...draft, id:crypto.randomUUID() };
  selected = {id:placed.id,type:placed.type};
  preview = null;
  commit(() => project.openings.push(placed));
});

plan.addEventListener('pointermove', event => {
  const p = coordinate(event);
  if (wallDrag) {
    if (distance(p,wallDrag.origin)<2) {
      wallDrag.point=wallDrag.wall[wallDrag.edge];
      wallDrag.change=null;
    } else {
      const pos=world(p);
      wallDrag.point=stretchPoint(wallDrag.wall,wallDrag.edge,pos,project.walls,{scale:camera.scale,magnetism});
      wallDrag.change=moveWallEndpoint(project,wallDrag.wall,wallDrag.edge,wallDrag.point);
    }
    setHint(wallDrag.change===false ? 'A alteração não cabe com as paredes e aberturas ligadas.' : 'Arraste para ajustar o comprimento no mesmo ângulo.');
  } else if (openingDrag) {
    if (distance(p,openingDrag.origin)<2) {
      openingDrag.next=null;
    } else {
      const {center,origin,opening}=openingDrag;
      const target={x:center.x+(p.x-origin.x)/camera.scale,y:center.y+(p.y-origin.y)/camera.scale};
      openingDrag.next=placeOpening(project,opening,target,{scale:camera.scale,magnetism});
      setHint(openingDrag.next ? 'Solte para encaixar a abertura.' : 'Arraste até um trecho livre de uma parede.');
    }
  } else if (dragging) {
    camera.x = dragging.x + (dragging.p.x-p.x)/camera.scale;
    camera.y = dragging.y + (dragging.p.y-p.y)/camera.scale;
  } else {
    const pos = world(p);
    if (tool==='select') {
      const hit=hitTest(pos);
      plan.style.cursor=endpointAt(pos) || (hit && hit.type!=='wall') ? 'grab' : 'default';
    }
    hover = tool === 'wall' ? snap(pos,event.shiftKey) : null;
    preview = ['door','window'].includes(tool) ? openingAt(pos,tool) : null;
  }
  draw();
});
function endDrag(event) {
  const change=wallDrag?.change;
  const previous=openingDrag?.opening;
  const next=openingDrag?.next;
  dragging=wallDrag=openingDrag=null;
  cursor();
  if (event.type==='pointerup' && change) {
    commit(() => { project.walls=change.walls; project.openings=change.openings; },{structure:true});
  } else if (event.type==='pointerup' && next &&
             (next.wallId!==previous.wallId || Math.abs(next.t-previous.t)>.000001)) {
    commit(() => { project.openings=project.openings.map(opening => opening.id===next.id ? next : opening); });
  } else draw();
}
plan.addEventListener('pointerup',endDrag);
plan.addEventListener('pointercancel',endDrag);
plan.addEventListener('pointerleave',() => { if (!dragging && !wallDrag && !openingDrag) { hover=preview=null; draw(); } });
plan.addEventListener('wheel',event => { event.preventDefault(); zoomPlan(Math.exp(-event.deltaY*.001),coordinate(event)); },{passive:false});
plan.addEventListener('contextmenu',event => event.preventDefault());

function cursor() { plan.style.cursor = tool==='pan' ? 'grab' : tool==='select' ? 'default' : 'crosshair'; }
function setHint(text) { $('hint').textContent=text; }
function setTool(next) {
  if (view!=='plan') return;
  if (next!==tool) {
    start=null;
    if (tool==='wall') placementDefaults.wall.thicknessOverride=null;
  }
  tool=next;
  placementPropertiesOpen=placementTools.includes(next);
  hover=preview=null;
  if (next!=='select') selected=null;
  cursor();
  refresh();
}

function activeWindowType() {
  return project.windowTypes.find(type => type.id===windowTypeId) ?? project.windowTypes[0];
}

function findWindowType(item) {
  return project.windowTypes.find(type => type.id===item.typeId);
}

function setItems(open, tab = itemsTab) {
  itemsOpen=open;
  itemsTab=tab;
  $('items').hidden=!open;
  $('items-toggle').setAttribute('aria-expanded',String(open));
  if (open) renderItems();
}

function itemRow(label,detail,action,type) {
  const button=document.createElement('button');
  button.className='item-row';
  const title=document.createElement('span');
  if (type) title.insertAdjacentHTML('beforeend',icon(type));
  title.append(document.createTextNode(label));
  const value=document.createElement('small');
  value.textContent=detail;
  if (type) title.append(value);
  button.append(title);
  if (!type) button.append(value);
  button.onclick=action;
  return button;
}

function selectItem(item,type) {
  if (view!=='plan') setView('plan');
  const wall=type==='wall' ? item : project.walls.find(candidate => candidate.id===item.wallId);
  if (!wall) return;
  const point=pointAt(wall,type==='wall' ? .5 : item.t);
  camera.x=point.x;
  camera.y=point.y;
  selected={id:item.id,type};
  if (matchMedia('(max-width: 600px)').matches) setItems(false);
  setTool('select');
}

function useCatalogItem(toolName,typeId) {
  if (view!=='plan') setView('plan');
  if (typeId) windowTypeId=typeId;
  if (matchMedia('(max-width: 600px)').matches) setItems(false);
  setTool(toolName);
}

function renderItems() {
  if (!itemsOpen) return;
  const list=$('item-list');
  const focusKey=document.activeElement?.dataset.itemKey;
  const scrollTop=$('items').scrollTop;
  list.replaceChildren();
  $('placed-items').setAttribute('aria-pressed',String(itemsTab==='placed'));
  $('catalog-items').setAttribute('aria-pressed',String(itemsTab==='catalog'));
  const metres=value => unit.format(value)+' m';
  const sizeLabel=item => unit.format(item.width)+' × '+metres(item.height);
  if (itemsTab==='catalog') {
    function addCatalogRow(name,detail,toolName,typeId) {
      const row=itemRow(name,detail,() => useCatalogItem(toolName,typeId),toolName);
      row.classList.add('catalog-row');
      row.dataset.itemKey='catalog-'+(typeId ?? toolName);
      row.setAttribute('aria-pressed',String(view==='plan' && tool===toolName &&
        (toolName!=='window' || activeWindowType().id===typeId)));
      list.append(row);
    }
    addCatalogRow('Porta simples',sizeLabel(placementDefaults.door),'door');
    for (const type of project.windowTypes) addCatalogRow(type.name,sizeLabel(type),'window',type.id);
  } else {
    function group(key,name,type,entries) {
      if (!entries.length) return;
      const details=document.createElement('details');
      details.className='item-group';
      details.open=expandedGroups.has(key);
      details.ontoggle=() => {
        if (!details.isConnected) return;
        if (details.open) expandedGroups.add(key);
        else expandedGroups.delete(key);
      };
      const summary=document.createElement('summary');
      summary.dataset.itemKey='group-'+key;
      const header=document.createElement('span');
      header.innerHTML=icon(type);
      header.append(document.createTextNode(name));
      const count=document.createElement('span');
      count.className='item-count';
      count.textContent=entries.length;
      header.append(count);
      summary.append(header);
      const children=document.createElement('div');
      children.className='item-children';
      entries.forEach((entry,index) => {
        const row=itemRow(shortNames[type]+' '+(index+1),type==='wall' ? metres(length(entry)) : sizeLabel(entry),
          () => selectItem(entry,type));
        row.dataset.itemKey=entry.id;
        if (selected?.id===entry.id) row.setAttribute('aria-current','true');
        children.append(row);
      });
      details.append(summary,children);
      list.append(details);
    }
    group('wall','Paredes','wall',project.walls);
    group('door','Portas','door',project.openings.filter(opening => opening.type==='door'));
    for (const type of project.windowTypes) {
      group(type.id,type.name,'window',project.openings.filter(opening => opening.typeId===type.id));
    }
    if (!list.childElementCount) {
      const note=document.createElement('p');
      note.className='item-note';
      note.textContent='A lista vai mostrar os itens que você colocar na planta.';
      list.append(note);
    }
  }
  [...list.querySelectorAll('[data-item-key]')].find(element => element.dataset.itemKey===focusKey)?.focus({preventScroll:true});
  $('items').scrollTop=scrollTop;
}

function numberField(name,label,value,min,max,optional=false) {
  const current=value===null ? '' : String(Math.round(value*1000)/1000);
  return '<label>'+label+'<div class="measure"><input type="number" data-field="'+name+'" min="'+min+
    '" max="'+max+'" step=".001" value="'+current+'"'+(optional?' placeholder="Livre"':' required')+'><span>m</span></div></label>';
}

function selectField(name,label,value,options) {
  const select=document.createElement('select');
  select.dataset.field=name;
  for (const [id,text] of options) select.add(new Option(text,id,String(value)===String(id)));
  return '<label>'+label+select.outerHTML+'</label>';
}

function openingFields(item,type) {
  return numberField('width','Largura',item.width,.2,8)+numberField('height','Altura',item.height,.2,8)+
    (type==='window' ? numberField('sill','Peitoril',item.sill,0,8) :
      selectField('hinge','Dobradiça',item.hinge,hingeOptions)+selectField('side','Sentido da abertura',item.side,swingOptions));
}

function renderProperties(panel, type, label, fields, note, onChange, removable=false) {
  panel.innerHTML='<div class="property-kind"><i>'+icon(type)+'</i><span></span></div><div class="fields">'+fields+
    '</div><p class="property-feedback" role="alert" hidden></p>'+
    (removable?'<button id="remove-selection" class="remove"><i>'+icon('trash')+'</i> Excluir</button>':'');
  panel.querySelector('.property-kind span').textContent=label;
  if (note) {
    const paragraph=document.createElement('p');
    paragraph.className='type-note';
    paragraph.textContent=note;
    panel.querySelector('.property-feedback').before(paragraph);
  }
  panel.querySelectorAll('[data-field]').forEach(element => {
    element.addEventListener('change',() => onChange(element));
    element.addEventListener('keydown',event => {
      if (event.key==='Enter' && element.matches('input')) element.blur();
    });
  });
  if (removable) $('remove-selection').onclick=remove;
}

function inspector() {
  const panel=$('properties');
  if (view==='plan' && placementTools.includes(tool)) {
    $('inspector').hidden=!placementPropertiesOpen;
    if (!placementPropertiesOpen) {
      panel.replaceChildren();
      return;
    }
    $('inspector-title').textContent='Antes de colocar';
    if (tool==='wall') {
      const {length:fixed,height}=placementDefaults.wall;
      const fields=numberField('length','Comprimento fixo',fixed,.15,150,true)+
        numberField('thickness','Espessura',placementThickness(),.05,1)+numberField('height','Altura',height,.5,12);
      renderProperties(panel,'wall','Parede',fields,'Deixe o comprimento vazio para desenhá-lo livremente.',applyPlacementField);
      renderWallStandard(panel);
    } else if (tool==='door') {
      renderProperties(panel,'door','Porta',openingFields(placementDefaults.door,'door'),'',applyPlacementField);
    } else {
      const type=activeWindowType();
      const fields=selectField('typeId','Tipo de janela',type.id,project.windowTypes.map(item => [item.id,item.name]))+
        openingFields(type,'window');
      renderProperties(panel,'window','Janela',fields,'As medidas valem para todas as janelas deste tipo.',applyPlacementField);
    }
    return;
  }
  const item=selected?.type==='wall'
    ? project.walls.find(wall => wall.id===selected.id)
    : project.openings.find(opening => opening.id===selected?.id);
  $('inspector').hidden=!item || view!=='plan';
  if (!item || view!=='plan') {
    panel.replaceChildren();
    return;
  }
  $('inspector-title').textContent='Propriedades';
  const fields=selected.type==='wall'
    ? numberField('length','Comprimento',length(item),.15,150)+numberField('thickness','Espessura',item.thickness,.05,1)+numberField('height','Altura',item.height,.5,12)
    : openingFields(item,selected.type);
  const count=item.type==='window' ? project.openings.filter(opening => opening.typeId===item.typeId).length : 0;
  const note=count===1 ? 'Novas janelas deste tipo usarão estas medidas.' :
    count>1 ? 'As medidas valem para as '+count+' janelas deste tipo.' : '';
  renderProperties(panel,selected.type,findWindowType(item)?.name ?? shortNames[selected.type],fields,note,
    element => applyField(item,element),true);
  if (selected.type==='wall' && straightenedEnd(item)) {
    const button=document.createElement('button');
    button.className='plain straighten';
    button.textContent='Endireitar parede';
    button.onclick=() => {
      const change=moveWallEndpoint(project,item,'b',straightenedEnd(item));
      if (!change) {
        showPropertyError(null,'A parede não pode ser endireitada sem afetar as aberturas ligadas.');
        return;
      }
      commit(() => { project.walls=change.walls; project.openings=change.openings; },{structure:true});
      setHint('Parede alinhada com a grade.');
    };
    panel.querySelector('#remove-selection').before(button);
  }
}

function renderWallStandard(panel) {
  const standard=document.createElement('div');
  standard.className='wall-standard';
  const label=document.createElement('p');
  label.className='type-note';
  label.textContent='Padrão da planta · '+unit.format(project.wallThickness*100)+' cm';
  const actions=document.createElement('div');
  actions.className='wall-standard-actions';

  function action(label,callback) {
    const button=document.createElement('button');
    button.type='button';
    button.className='plain';
    button.textContent=label;
    button.onclick=callback;
    actions.append(button);
  }

  action('Usar padrão',() => {
    placementDefaults.wall.thicknessOverride=null;
    hover=null;
    refresh();
  });
  action('Definir padrão',() => saveWallThickness(false));
  if (project.walls.length) action('Aplicar a todas as paredes',() => saveWallThickness(true));
  standard.append(label,actions);
  panel.append(standard);
}

function saveWallThickness(applyToAll) {
  if ($('properties').querySelector('[data-field="thickness"][aria-invalid="true"]')) return;
  const thickness=placementThickness();
  const changed=applyToAll ? project.walls.filter(wall=>wall.thickness!==thickness).length : 0;
  placementDefaults.wall.thicknessOverride=null;
  hover=null;
  if (changed || thickness!==project.wallThickness) {
    commit(() => { project=changeWallThickness(project,thickness,applyToAll); });
  } else refresh();
  const caption=unit.format(thickness*100)+' cm';
  const message=applyToAll
    ? 'Todas as '+project.walls.length+' paredes e o padrão da planta estão em '+caption+'.'
    : 'Novas paredes usarão '+caption+' por padrão.';
  setHint(message);
}

function showPropertyError(element,message) {
  const field=$('properties').querySelector('.property-feedback');
  if (!field) return;
  if (element) {
    if (message) {
      element.setAttribute('aria-invalid','true');
      element.dataset.error=message;
    } else {
      element.removeAttribute('aria-invalid');
      delete element.dataset.error;
    }
  }
  field.textContent=message || $('properties').querySelector('[aria-invalid="true"]')?.dataset.error || '';
  field.hidden=!field.textContent;
}

function applyPlacementField(element) {
  const name=element.dataset.field;
  if (name==='typeId') {
    windowTypeId=element.value;
    preview=null;
    refresh();
    return;
  }
  const optional=tool==='wall' && name==='length';
  const value=optional && element.value==='' ? null : name==='hinge' ? element.value : Number(element.value);
  if (!element.checkValidity() || (value!==null && name!=='hinge' && !Number.isFinite(value))) {
    showPropertyError(element,'Digite uma medida válida.');
    return;
  }
  if (tool==='window') {
    const type=activeWindowType();
    const change=resizeWindowType(project,type.id,name,value);
    if (!change) {
      showPropertyError(element,'Essa medida não cabe em todas as janelas deste tipo.');
      return;
    }
    if (type[name]!==value) saveWindowType(change,false);
  } else {
    if (tool==='wall' && name==='thickness')
      placementDefaults.wall.thicknessOverride=value===project.wallThickness ? null : value;
    else placementDefaults[tool][name]=value;
    if (tool==='wall' && name==='length') {
      const fixedHint=start ? 'Clique na direção da parede para aplicar o comprimento fixo.' : 'Clique no ponto inicial da parede.';
      setHint(value===null ? tools.wall[1] : fixedHint);
    }
  }
  showPropertyError(element,'');
  preview=hover=null;
  draw();
}

function saveWindowType(change,refreshInspector) {
  commit(() => {
    project.openings=change.openings;
    project.windowTypes=change.windowTypes;
  },{update:refreshInspector});
  if (!refreshInspector) {
    $('undo').disabled=false;
    $('redo').disabled=true;
    renderItems();
  }
  const message=change.count===0 ? 'Medida salva para as próximas janelas deste tipo.' :
    change.count===1 ? 'Medida da janela atualizada.' : 'Medida atualizada em '+change.count+' janelas.';
  setHint(message);
}

function applyField(item, element) {
  const name = element.dataset.field;
  const value = name==='hinge' ? element.value : Number(element.value);
  if (element.value==='' || !element.checkValidity() || (name!=='hinge' && !Number.isFinite(value))) {
    refresh();
    setHint('Digite uma medida válida.');
    return;
  }
  if (selected.type==='wall') {
    if (name==='length') {
      const angle=heading(item);
      const endpoint={x:item.a.x+Math.cos(angle)*value,y:item.a.y+Math.sin(angle)*value};
      const change=moveWallEndpoint(project,item,'b',endpoint);
      if (!change) {
        if (change===false) {
          refresh();
          setHint('A medida não cabe com as paredes e aberturas ligadas.');
        }
        return;
      }
      commit(() => { project.walls=change.walls; project.openings=change.openings; },{structure:true});
      return;
    }
    const update={...item,[name]:value};
    const siblings=project.openings.filter(opening => opening.wallId===item.id);
    if (siblings.some(opening => !validateOpening(opening,update,siblings))) {
      refresh();
      setHint('A nova medida não comporta as portas ou janelas desta parede.');
      return;
    }
    commit(() => Object.assign(item,update));
    return;
  }
  if (item.type==='window') {
    const change=resizeWindowType(project,item.typeId,name,value);
    if (!change) {
      refresh();
      showPropertyError(null,'Essa medida não cabe em todas as janelas deste tipo.');
      return;
    }
    saveWindowType(change,true);
    return;
  }
  const update = {...item,[name]:value};
  const wall = project.walls.find(w => w.id===item.wallId);
  if (!validateOpening(update,wall,project.openings)) {
    refresh();
    setHint('A medida precisa caber na parede e deixar espaço para as outras aberturas.');
    return;
  }
  commit(() => Object.assign(item,update));
}

function remove() {
  if (!selected || view!=='plan') return;
  const {id,type} = selected;
  selected=null;
  commit(() => {
    if (type==='wall') project.walls=project.walls.filter(wall => wall.id!==id);
    project.openings=project.openings.filter(opening => opening.id!==id && opening.wallId!==id);
  },{structure:type==='wall'});
}

function refresh() {
  const isPlan = view==='plan';
  $('project-name').value=project.name;
  $('project-count').textContent=project.walls.length+' '+(project.walls.length===1?'parede':'paredes')+' · '+
    project.openings.length+' '+(project.openings.length===1?'abertura':'aberturas');
  $('mode').textContent=isPlan ? tools[tool][0] : 'Navegação 3D';
  let hint=tools[tool][1];
  if (tool==='window') hint=activeWindowType().name+' · clique em uma parede.';
  if (tool==='wall' && placementDefaults.wall.length!==null)
    hint=start ? 'Clique na direção da parede para aplicar o comprimento fixo.' : 'Clique no ponto inicial da parede.';
  if (tool==='select' && selected?.type==='wall') hint='Arraste uma ponta para esticar a parede no mesmo ângulo.';
  if (tool==='select' && selected && selected.type!=='wall') hint='Arraste o item para outro trecho de parede.';
  setHint(isPlan ? hint : 'Arraste para girar e role para aproximar ou afastar.');
  $('plan-button').setAttribute('aria-pressed',String(isPlan));
  $('model-button').setAttribute('aria-pressed',String(!isPlan));
  $('orientation').hidden=!isPlan;
  $('scale-bar').hidden=!isPlan;
  $('empty').hidden=project.walls.length>0 || !isPlan || tool!=='select';
  $('undo').disabled=!past.length;
  $('redo').disabled=!future.length;
  $('magnetism').disabled=!isPlan;
  $('magnetism').setAttribute('aria-pressed',String(magnetism));
  $('magnetism').title='Magnetismo '+(magnetism?'ligado':'desligado')+' (G)';
  document.querySelectorAll('[data-tool]').forEach(button => {
    button.disabled=!isPlan;
    button.setAttribute('aria-pressed',String(isPlan && button.dataset.tool===tool));
  });
  inspector();
  renderItems();
  if (isPlan) draw();
  else model?.setProject(project);
}

async function setView(next) {
  if (view===next) return;
  const turn=++viewChange;
  view=next;
  start=hover=preview=selected=wallDrag=openingDrag=null;
  const isPlan=next==='plan';
  plan.hidden=!isPlan;
  $('model').hidden=isPlan;
  refresh();
  if (isPlan) {
    model?.pause();
    return;
  }
  if (model) {
    model.resume();
    model.resize();
    $('zoom').value=Math.round(100*model.zoom)+'%';
    return;
  }
  $('zoom').value='100%';
  const host=$('model');
  host.innerHTML='<div class="model-error" role="status">Carregando vista 3D…</div>';
  try {
    const { createModel }=await import('./model.mjs');
    if (turn!==viewChange) return;
    host.replaceChildren();
    model=createModel(host,value => { if (view==='model') $('zoom').value=Math.round(value*100)+'%'; });
    model.setProject(project);
    model.fit();
    model.resume();
  } catch (error) {
    if (turn!==viewChange) return;
    console.error(error);
    host.innerHTML='<div class="model-error" role="status">O navegador não conseguiu abrir a vista 3D. A planta 2D está disponível.</div>';
  }
}

function zoom(factor) {
  if (view==='plan') zoomPlan(factor);
  else model?.changeZoom(factor);
}

$('plan-button').onclick=() => setView('plan');
$('model-button').onclick=() => setView('model');
$('fit').onclick=() => view==='plan' ? fitPlan() : model?.fit();
$('zoom-in').onclick=() => zoom(1.2);
$('zoom-out').onclick=() => zoom(1/1.2);
$('undo').onclick=() => history(past,future);
$('redo').onclick=() => history(future,past);
$('project-name').onchange=event => {
  const name=event.target.value.trim() || 'Sem título';
  if (name!==project.name) commit(() => { project.name=name; },{update:false});
  refresh();
};
document.querySelectorAll('[data-tool]').forEach(button => { button.onclick=() => setTool(button.dataset.tool); });
$('close-properties').onclick=() => {
  if (placementTools.includes(tool)) placementPropertiesOpen=false;
  else selected=null;
  refresh();
};
$('items-toggle').onclick=() => setItems(!itemsOpen);
$('magnetism').onclick=() => {
  magnetism=!magnetism;
  hover=preview=null;
  refresh();
  setHint(magnetism ? 'Magnetismo ligado. Comprimentos de 10 em 10 cm.' : 'Magnetismo desligado.');
};
$('close-items').onclick=() => { setItems(false); $('items-toggle').focus(); };
$('placed-items').onclick=() => setItems(true,'placed');
$('catalog-items').onclick=() => setItems(true,'catalog');
$('new').onclick=() => { $('new-dialog').returnValue=''; $('new-dialog').showModal(); };
$('new-dialog').onclose=() => {
  const choice=$('new-dialog').returnValue;
  if (choice!=='blank' && choice!=='template') return;
  selected=start=hover=preview=wallDrag=openingDrag=null;
  commit(() => {
    project=prepareProject(choice==='template' ? defaultProject() : {name:'Sem título',walls:[],openings:[]});
    placementDefaults.wall.thicknessOverride=null;
  });
  if (view!=='plan') setView('plan');
  setTool(choice==='template' ? 'select' : 'wall');
  fitPlan();
};
document.addEventListener('keydown',event => {
  if (event.target.matches('input,select,textarea') || $('new-dialog').open) return;
  const key=event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && ['z','y'].includes(key)) {
    event.preventDefault();
    if (key==='y' || event.shiftKey) history(future,past);
    else history(past,future);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (key==='i') { setItems(!itemsOpen); return; }
  if (view!=='plan') return;
  if (key==='g') { $('magnetism').click(); return; }
  const shortcuts={v:'select',p:'wall',d:'door',j:'window',m:'pan'};
  if (shortcuts[key]) setTool(shortcuts[key]);
  else if (key==='escape') { start=hover=preview=selected=wallDrag=openingDrag=null; cursor(); refresh(); }
  else if (['delete','backspace'].includes(key) && selected) { event.preventDefault(); remove(); }
});

new ResizeObserver(resize).observe(stage);
document.fonts?.ready.then(draw);
persist();
refresh();
