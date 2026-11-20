import { bounds, clamp, distance, heading, interval, legacyExampleProject, length, nearestWall, validateOpening } from './geometry.mjs';
import { icon, renderIcons } from './icons.mjs';
import { defaultProject, houseOutline } from './template.mjs';

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
let project = restore();
let tool = 'select';
let view = 'plan';
let selected = null;
let start = null;
let hover = null;
let preview = null;
let dragging = null;
let model = null;
let viewChange = 0;
let size = { width: 1, height: 1 };
let camera = { x: 0, y: 0, scale: 56, base: 56 };
let fitted = false;
const past = [];
const future = [];
renderIcons();

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
  selected = start = hover = preview = null;
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

function paintWall(wall, ghost = false) {
  inWallFrame(wall, (width, thickness) => {
    const active = selected?.id === wall.id;
    thickness = Math.max(3, thickness);
    context.fillStyle = ghost ? '#52ac8a96' : active ? '#21866a' : '#25493e';
    context.fillRect(-thickness/2, -thickness/2, width+thickness, thickness);
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

function paintOpening(opening, ghost = false) {
  const wall = project.walls.find(w => w.id === opening.wallId);
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
  project.walls.forEach(wall => paintWall(wall));
  project.openings.forEach(opening => paintOpening(opening));
  const selectedWall = project.walls.find(wall => wall.id === selected?.id);
  if (selectedWall) {
    wallMeasure(selectedWall);
    for (const point of [selectedWall.a, selectedWall.b]) dot(point, '#23775f');
  } else if (project.template === 'house') {
    const box = bounds(project);
    wallMeasure({a:{x:box.x,y:box.y},b:{x:box.x+box.width,y:box.y}},24);
    wallMeasure({a:{x:box.x,y:box.y+box.depth},b:{x:box.x,y:box.y}},23);
  }
  if (tool === 'wall' && hover) {
    if (start && distance(start, hover) > .02) {
      const ghost = { a:start, b:hover, thickness:.15 };
      paintWall(ghost, true);
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

function snap(point, ortho) {
  const adjusted = ortho && start
    ? Math.abs(point.x-start.x) >= Math.abs(point.y-start.y) ? {x:point.x,y:start.y} : {x:start.x,y:point.y}
    : point;
  const nearby = project.walls.flatMap(wall => [wall.a,wall.b])
    .map(p => ({p,d:distance(p,adjusted)})).sort((a,b) => a.d-b.d)[0];
  if (nearby && nearby.d <= 9/camera.scale && (!ortho || !start || nearby.p.x === start.x || nearby.p.y === start.y)) return nearby.p;
  return { x: Math.round(adjusted.x * 10)/10, y: Math.round(adjusted.y * 10)/10 };
}

function openingAt(point, type) {
  const hit = nearestWall(point, project.walls, 13/camera.scale);
  if (!hit) return null;
  const width = type === 'door' ? .86 : 1.2;
  const height = type === 'door' ? 2.1 : 1.05;
  const sill = type === 'door' ? 0 : .95;
  const wallLength = length(hit.wall);
  const margin = (width/2 + .05) / wallLength;
  if (margin > .5) return null;
  const draft = {wallId:hit.wall.id,type,t:clamp(hit.t,margin,1-margin),width,height,sill,hinge:'start',side:1};
  return validateOpening(draft, hit.wall, project.openings) ? draft : null;
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
  const pos = world(p);
  if (tool === 'select') {
    selected = hitTest(pos);
    refresh();
    return;
  }
  if (tool === 'wall') {
    const point = snap(pos, event.shiftKey);
    if (!start) { start=point; hover=point; refresh(); return; }
    if (distance(start,point)<.15) { setHint('Escolha um ponto a pelo menos 15 cm do início.'); return; }
    const wall = {id:crypto.randomUUID(),a:start,b:point,thickness:.15,height:2.7};
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
  if (dragging) {
    camera.x = dragging.x + (dragging.p.x-p.x)/camera.scale;
    camera.y = dragging.y + (dragging.p.y-p.y)/camera.scale;
  } else {
    const pos = world(p);
    hover = tool === 'wall' ? snap(pos,event.shiftKey) : null;
    preview = ['door','window'].includes(tool) ? openingAt(pos,tool) : null;
  }
  draw();
});
function endDrag() { dragging=null; cursor(); }
plan.addEventListener('pointerup',endDrag);
plan.addEventListener('pointercancel',endDrag);
plan.addEventListener('pointerleave',() => { if (!dragging) { hover=preview=null; draw(); } });
plan.addEventListener('wheel',event => { event.preventDefault(); zoomPlan(Math.exp(-event.deltaY*.001),coordinate(event)); },{passive:false});
plan.addEventListener('contextmenu',event => event.preventDefault());

function cursor() { plan.style.cursor = tool==='pan' ? 'grab' : tool==='select' ? 'default' : 'crosshair'; }
function setHint(text) { $('hint').textContent=text; }
function setTool(next) {
  if (view!=='plan') return;
  tool=next;
  start=hover=preview=null;
  if (next!=='select') selected=null;
  cursor();
  refresh();
}

function inspector() {
  const panel = $('properties');
  const item = selected?.type==='wall'
    ? project.walls.find(wall => wall.id===selected.id)
    : project.openings.find(opening => opening.id===selected?.id);
  $('inspector').hidden = !item || view !== 'plan';
  if (!item) {
    panel.replaceChildren();
    return;
  }
  const input = (name,label,value,min,max) => '<label>'+label+'<div class="measure"><input type="number" data-field="'+name+'" min="'+min+'" max="'+max+'" step=".001" value="'+Math.round(value*1000)/1000+'"><span>m</span></div></label>';
  const dropdown = (name,label,value,options) => '<label>'+label+'<select data-field="'+name+'">'+options.map(([id,text]) => '<option value="'+id+'"'+(String(value)===String(id)?' selected':'')+'>'+text+'</option>').join('')+'</select></label>';
  const isWall = selected.type==='wall';
  const fields = isWall
    ? input('length','Comprimento',length(item),.15,150) + input('thickness','Espessura',item.thickness,.05,1) + input('height','Altura',item.height,.5,12)
    : input('width','Largura',item.width,.2,8) + input('height','Altura',item.height,.2,8) +
      (item.type==='window' ? input('sill','Peitoril',item.sill,0,8)
        : dropdown('hinge','Dobradiça',item.hinge,[['start','Lado 1'],['end','Lado 2']]) +
          dropdown('side','Sentido da abertura',item.side,[[1,'Um lado da parede'],[-1,'Outro lado da parede']]));
  panel.innerHTML = '<div class="property-kind"><i>'+icon(selected.type)+'</i>'+shortNames[selected.type]+'</div><div class="fields">'+fields+
    '</div><button id="remove-selection" class="remove"><i>'+icon('trash')+'</i> Excluir</button>';
  panel.querySelectorAll('[data-field]').forEach(element => {
    element.addEventListener('change', () => applyField(item,element));
    element.addEventListener('keydown', event => {
      if(event.key==='Enter') element.blur();
    });
  });
  $('remove-selection').onclick = remove;
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
    const angle = heading(item);
    const update = name==='length'
      ? {...item,b:{x:item.a.x+Math.cos(angle)*value,y:item.a.y+Math.sin(angle)*value}}
      : {...item,[name]:value};
    const siblings = project.openings.filter(opening => opening.wallId===item.id);
    if (siblings.some(opening => !validateOpening(opening,update,siblings))) {
      refresh();
      setHint('A nova medida não comporta as portas ou janelas desta parede.');
      return;
    }
    commit(() => {
      if (name==='length') {
        for (const wall of project.walls) {
          if (wall.id===item.id) continue;
          const moved = {...wall};
          if (distance(wall.a,item.b)<.0001) moved.a=update.b;
          if (distance(wall.b,item.b)<.0001) moved.b=update.b;
          const attached = project.openings.filter(opening => opening.wallId===wall.id);
          if (length(moved)>=.15 && attached.every(opening => validateOpening(opening,moved,attached))) Object.assign(wall,moved);
        }
      }
      Object.assign(item,update);
    },{structure:name==='length'});
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
  setHint(isPlan ? tools[tool][1] : 'Arraste para girar e role para aproximar ou afastar.');
  $('plan-button').setAttribute('aria-pressed',String(isPlan));
  $('model-button').setAttribute('aria-pressed',String(!isPlan));
  $('orientation').hidden=!isPlan;
  $('scale-bar').hidden=!isPlan;
  $('empty').hidden=project.walls.length>0 || !isPlan || tool!=='select';
  $('undo').disabled=!past.length;
  $('redo').disabled=!future.length;
  document.querySelectorAll('[data-tool]').forEach(button => {
    button.disabled=!isPlan;
    button.setAttribute('aria-pressed',String(isPlan && button.dataset.tool===tool));
  });
  inspector();
  if (isPlan) draw();
  else model?.setProject(project);
}

async function setView(next) {
  if (view===next) return;
  const turn=++viewChange;
  view=next;
  start=hover=preview=selected=null;
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
$('close-properties').onclick=() => { selected=null; refresh(); };
$('new').onclick=() => { $('new-dialog').returnValue=''; $('new-dialog').showModal(); };
$('new-dialog').onclose=() => {
  const choice=$('new-dialog').returnValue;
  if (choice!=='blank' && choice!=='template') return;
  selected=start=hover=preview=null;
  commit(() => {
    project=choice==='template' ? defaultProject() : {name:'Sem título',walls:[],openings:[]};
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
  if (view!=='plan' || event.metaKey || event.ctrlKey || event.altKey) return;
  const shortcuts={v:'select',p:'wall',d:'door',j:'window',m:'pan'};
  if (shortcuts[key]) setTool(shortcuts[key]);
  else if (key==='escape') { start=hover=preview=selected=null; refresh(); }
  else if (['delete','backspace'].includes(key) && selected) { event.preventDefault(); remove(); }
});

new ResizeObserver(resize).observe(stage);
document.fonts?.ready.then(draw);
persist();
refresh();
