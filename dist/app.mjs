import { kitchenOptionPlan, kitchenOptions } from './kitchen-options.mjs';
import { siteExterior } from './site-exterior.mjs';
import { furnitureFootprint, furnitureNames, furnitureTarget } from './furniture-position.mjs?v=20261122-banheiros';
import { interiorLayout } from './interior-layout.mjs?v=20261126-opcoes';
import { livingRoomFurniture } from './living-room.mjs?v=20261122-moveis';
import { bounds, changeWallThickness, clamp, distance, heading, interval, joinedWallCaps, length, placeOpening, pointAt, projectToWall, validateOpening, withWallThickness } from './geometry.mjs';
import { icon, renderIcons } from './icons.mjs';
import { defaultProject, houseOutline } from './template.mjs';
import { kitchenWindowDimensions, livingRoomLabel, livingWindowDimensions, lowerLeftDoorDimensions, rearBathroomDimensions, surveyDimensions, surveyDoors, surveyOutline, withSurveyCorrections } from './survey.mjs?v=20261124-etapas';
import { resizeWindowType, withWindowTypes } from './window-types.mjs';
import { measurePoint, wallFaces } from './measure.mjs';
import { projectCode, startSync } from './sync.mjs?v=20261124-original';
import { renovation, reviewStage, sharedRenovation, stagePlans } from './renovation.mjs?v=20261124-original';
import { minimumWallLength, moveWallEndpoint, moveWallGroup, snapWallPoint, straightenedEnd, stretchPoint, wallDragDelta } from './wall-edit.mjs';

const $ = id => document.getElementById(id);
const plan = $('plan');
const stage = $('stage');
const context = plan.getContext('2d');
const kitchenPhotoKey='traco-planta-foto-janela-cozinha';
const defaultKitchenPhoto=new URL('./assets/vista-cozinha.webp',import.meta.url).href;
const unit = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const preciseUnit = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const tools = {
  select: ['Selecionar', 'Toque ou clique para selecionar. Arraste para mover móveis.'],
  wall: ['Parede', 'Clique no início e depois no fim de cada parede. Esc encerra.'],
  door: ['Porta', 'Clique sobre uma parede para encaixar a porta.'],
  window: ['Janela', 'Clique sobre uma parede para encaixar a janela.'],
  measure: ['Medir', 'Clique no primeiro ponto da medida.'],
  pan: ['Mover vista', 'Arraste para mover a planta. Role para ampliar ou reduzir.']
};
const messages = {
  door: 'Escolha um trecho livre da parede com espaço para a porta.',
  window: 'Escolha um trecho livre da parede com espaço para a janela.'
};
const shortNames = { wall: 'Parede', door: 'Porta', window: 'Janela' };
let project=prepareProject(defaultProject());
let remodel=null;
let plans=[];
let stageId=null;
let optionId=null;
let editing=null;
let review=null;
let savingStage=false;
let sync;
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
let measureStart = null;
let measureEnd = null;
let measureHover = null;
let measureFaces = [];
let view = 'plan';
let showOriginal = false;
let selected = null;
const selectedWalls = new Set();
let multiSelect = false;
let start = null;
let hover = null;
let preview = null;
let dragging = null;
let furnitureDrag=null;
let wallDrag = null;
let wallGroupDrag = null;
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

function prepareProject(value) { return withWindowTypes(withWallThickness(withSurveyCorrections(value))); }

function placementThickness() {
  return placementDefaults.wall.thicknessOverride ?? project.wallThickness;
}

function syncStatus(state,text) {
  $('sync-dot').dataset.state=state;
  $('share').title=text+' · clique para copiar o link';
  $('save-status').textContent=text;
}

function applyRemote(data) {
  if (!data?.walls || !data?.openings) return;
  const first=!remodel;
  remodel=renovation(Array.isArray(data.stages) ? data : prepareProject(data));
  plans=stagePlans(remodel);
  $('project-access').hidden=true;
  $('editor').hidden=false;
  $('timeline').hidden=false;
  $('share').hidden=false;
  displayStage(stageId,optionId);
  if (first) fitPlan();
}

function displayStage(id,proposal=null) {
  const optionPlan=proposal ? kitchenOptionPlan(remodel.original,proposal) : null;
  if (proposal && !optionPlan) {
    toast('A geometria atual não comporta esta opção de planta.');
    proposal=null;
  }
  optionId=proposal;
  const index=remodel.stages.findIndex(stage=>stage.id===id);
  stageId=index<0 ? null : id;
  project=optionPlan ?? structuredClone(plans[index+1]);
  project.surveyed=remodel.surveyed;
  project.original=remodel.original;
  past.length=future.length=0;
  showOriginal=false;
  start=hover=preview=null;
  tool='select';
  placementPropertiesOpen=false;
  placementDefaults.wall.thicknessOverride=null;
  resetSelection();
  resetMeasure();
  setItems(false);
  cursor();
  renderTimeline();
  refresh();
}

function renderTimeline() {
  const list=$('stage-links');
  const activeBefore=list.querySelector('[aria-current="step"]');
  const previousScroll=list.scrollLeft;
  list.replaceChildren();
  const stages=[{id:null,title:'Original'},...remodel.stages];
  if (editing && !stages.some(stage=>stage.id===editing.id)) {
    stages.push({id:editing.id,title:'Nova etapa'});
  }
  for (const [number,stage] of stages.entries()) {
    const button=document.createElement('button');
    button.type='button';
    button.className='plain';
    button.textContent=number ? 'Etapa '+number+' · '+stage.title : stage.title;
    if (!optionId && stage.id===stageId) button.setAttribute('aria-current','step');
    button.disabled=savingStage;
    button.onclick=()=>{
      if ((!optionId && stageId===stage.id) || !discardDraft()) return;
      displayStage(stage.id);
      list.querySelector('[aria-current="step"]')?.focus();
    };
    list.append(button);
  }
  list.scrollLeft=previousScroll;
  if (!activeBefore || list.querySelector('[aria-current="step"]')?.textContent!==activeBefore.textContent) {
    list.querySelector('[aria-current="step"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  const options=$('kitchen-options');
  options.hidden=Boolean(editing);
  for (const button of options.querySelectorAll('button')) {
    button.setAttribute('aria-pressed',String(button.dataset.option===optionId));
    button.disabled=savingStage;
  }
  const details=$('kitchen-option-detail');
  details.hidden=!optionId;
  details.textContent=optionId ? kitchenOptions.find(option=>option.id===optionId).detail : '';
  $('edit-stage').hidden=Boolean(editing || optionId);
  $('edit-stage').textContent=stageId===null ? 'Editar Original' : 'Editar etapa';
  $('edit-stage').disabled=$('add-stage').disabled=savingStage;
  $('add-stage').hidden=Boolean(editing || optionId);
  $('stage-draft').hidden=!editing;
  const editingOriginal=editing?.id===null;
  $('original-edit-warning').hidden=!editingOriginal;
  $('stage-name').hidden=$('stage-name-label').hidden=editingOriginal;
  $('stage-name').disabled=$('save-stage').disabled=$('cancel-stage').disabled=savingStage;
  const editingIndex=remodel.stages.findIndex(stage=>stage.id===editing?.id);
  $('save-stage').textContent=editingOriginal ? 'Salvar Original' :
    editingIndex>=0 && editingIndex<remodel.stages.length-1 ? 'Revisar impacto' : 'Salvar etapa';
}

function discardDraft() {
  if (!editing) return true;
  if ((past.length || $('stage-name').value.trim()!==editing.title) &&
      !window.confirm(editing.id===null ? 'Descartar as alterações da planta Original?' : 'Descartar as alterações desta etapa?')) return false;
  stageId=editing.previous;
  editing=null;
  return true;
}

function editStage(create) {
  if (editing || savingStage) return;
  const existing=remodel.stages.find(stage=>stage.id===stageId);
  if (!create && !existing && stageId!==null) return;
  const previous=stageId;
  if (create) displayStage(remodel.stages.at(-1)?.id ?? null);
  const id=create ? crypto.randomUUID() : existing?.id ?? null;
  const title=create ? '' : existing?.title ?? '';
  editing={id,title,previous};
  stageId=id;
  $('stage-name').value=title;
  if (view!=='plan') setView('plan');
  renderTimeline();
  refresh();
  if (id===null) $('save-stage').focus();
  else $('stage-name').focus();
}

function summarizeConflict({path,opening,stage,number}) {
  const kinds={walls:'parede',openings:opening?.type==='window' ? 'janela' : opening?.type==='door' ? 'porta' : 'porta ou janela',windowTypes:'tipo de janela',furniturePositions:'posição de móvel'};
  return 'Etapa '+number+' · '+stage.title+' — '+(kinds[path[0]]??'configuração da planta')+
    (opening ? ' ficou sem um encaixe válido.' : ' recebeu alterações incompatíveis.');
}

function saveStage() {
  if (!editing || savingStage || $('review-dialog').open) return;
  if (wallDrag || wallGroupDrag || openingDrag || furnitureDrag || dragging) {
    toast('Termine o movimento antes de salvar a etapa.');
    return;
  }
  const title=$('stage-name').value.trim();
  const editingOriginal=editing.id===null;
  if (!editingOriginal && !title) {
    $('stage-name').focus();
    toast('Dê um nome à etapa.');
    return;
  }
  review=reviewStage(remodel,editing.id,title,project);
  const later=remodel.stages.findIndex(stage=>stage.id===editing.id);
  if (!editingOriginal && (later<0 || later===remodel.stages.length-1)) {
    commitStage();
    return;
  }
  const {impacted,conflicts}=review;
  $('review-title').textContent=editingOriginal ? 'Salvar a planta Original?' : 'Revisar impacto';
  const impactMessage=impacted.length
    ? 'Etapas que serão atualizadas — '+impacted.map(stage=>
      (remodel.stages.indexOf(stage)+1)+' · '+stage.title).join(', ')+'.'
    : 'As plantas das etapas seguintes ficam iguais.';
  $('review-summary').textContent=editingOriginal
    ? 'Você vai alterar a planta Original.'+(remodel.stages.length ? ' '+impactMessage : '')
    : impactMessage;
  const list=$('review-conflicts');
  list.replaceChildren(...[...new Set(conflicts.map(summarizeConflict))].map(message=>{
    const item=document.createElement('li');
    item.textContent=message;
    return item;
  }));
  list.hidden=!conflicts.length;
  $('confirm-review').textContent=conflicts.length ? 'Descartar conflitos e propagar' :
    editingOriginal ? 'Confirmar e salvar Original' : 'Propagar e salvar';
  $('review-dialog').returnValue='';
  $('review-dialog').showModal();
}

async function commitStage() {
  if (!review || !editing || savingStage) return;
  savingStage=true;
  const id=editing.id;
  const draft=editing;
  editing=null;
  renderTimeline();
  refresh();
  const result=await sync.save(sharedRenovation(review.document),{original:id===null});
  savingStage=false;
  review=null;
  if (result==='saved') {
    displayStage(id);
    toast(id===null ? 'Planta Original salva.' : 'Etapa salva.');
  } else {
    editing=draft;
    if (result==='conflict') toast('Outra pessoa salvou primeiro. O rascunho segue aberto. Cancele a edição para carregar a versão da nuvem.');
    else toast('O rascunho segue aberto. Confira a conexão e tente salvar novamente.');
    renderTimeline();
    refresh();
  }
}

function toast(text) {
  document.querySelector('.share-toast')?.remove();
  const element = document.createElement('div');
  element.className = 'share-toast';
  element.setAttribute('role','status');
  element.textContent = text;
  document.body.append(element);
  setTimeout(() => element.remove(), 3500);
}

function commit(change, { structure = false, update = true } = {}) {
  if (!editing) return;
  past.push(structuredClone(project));
  if (past.length > 100) past.shift();
  future.length = 0;
  change();
  if (structure) {
    delete project.template;
    delete project.example;
  }
  if (update) refresh();
}

function setSelection(item, toggle=false) {
  if (toggle && item?.type==='wall') {
    if (selectedWalls.has(item.id)) selectedWalls.delete(item.id);
    else selectedWalls.add(item.id);
    const id=[...selectedWalls].at(-1);
    selected=id ? {id,type:'wall'} : null;
    return;
  }
  selected=item;
  selectedWalls.clear();
  if (item?.type==='wall') selectedWalls.add(item.id);
}

function resetSelection() {
  setSelection(null);
  multiSelect=false;
  dragging=wallDrag=openingDrag=wallGroupDrag=furnitureDrag=null;
}

function history(from, to) {
  if (!editing || !from.length) return;
  to.push(project);
  project = from.pop();
  placementDefaults.wall.thicknessOverride=null;
  start=hover=preview=null;
  resetSelection();
  resetMeasure();
  if (tool==='measure') measureFaces=wallFaces(project.walls);
  refresh();
}

const screen = p => ({ x: size.width / 2 + (p.x - camera.x) * camera.scale, y: size.height / 2 + (p.y - camera.y) * camera.scale });
const world = p => ({ x: camera.x + (p.x - size.width / 2) / camera.scale, y: camera.y + (p.y - size.height / 2) / camera.scale });

function fitPlan() {
  const originals=project.original?.walls ?? [];
  const walls=showOriginal ? [...project.walls,...originals] : project.walls;
  const box = bounds({walls});
  const exterior=siteExterior({walls});
  const x=exterior ? Math.min(box.x,exterior.garage.left) : box.x;
  const y=exterior ? Math.min(box.y,exterior.side.gateY-.24) : box.y;
  const right=exterior ? Math.max(box.x+box.width,exterior.side.outer+.78) : box.x+box.width;
  const bottom=box.y+box.depth;
  const scale = clamp(Math.min((size.width - 64) / (right-x), (size.height - 82) / (bottom-y)), 10, 135);
  camera = { x:(x+right)/2, y:(y+bottom)/2, scale, base:scale };
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
  const outline = project.template==='survey' ? surveyOutline : project.template==='house' ? houseOutline : null;
  if (!outline) return;
  context.beginPath();
  outline.forEach(([x,y],index) => {
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

function paintWall(wall, walls, ghost = false, reference = false) {
  const caps=joinedWallCaps(wall,walls);
  inWallFrame(wall, (width, thickness) => {
    const active = !reference && selectedWalls.has(wall.id);
    thickness = Math.max(3, thickness);
    context.fillStyle = reference ? '#adbed3' : ghost ? '#52ac8a96' : active ? '#21866a' : '#25493e';
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

function paintOpening(opening, ghost = false, walls = project.walls, reference = false) {
  const wall = walls.find(w => w.id === opening.wallId);
  if (!wall) return;
  inWallFrame(wall, (wallLength, thickness) => {
    thickness = Math.max(3, thickness);
    const width = opening.width * camera.scale;
    const x = opening.t * wallLength - width/2;
    const active = !reference && selected?.id === opening.id;
    const color = reference ? '#9aaec7' : active ? '#117453' : opening.type === 'door' ? '#537b66' : '#3b8d82';
    const y = thickness / 2;
    if (ghost) context.globalAlpha = .66;
    context.fillStyle = opening.type === 'door' ? '#f6faf6' : reference ? '#dce7f2' : '#beebe1';
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

function measurementLabel(value) {
  return value<1 ? unit.format(value*100)+' cm' : preciseUnit.format(value)+' m';
}

function drawMeasurement() {
  const color='#1c7062';
  if (!measureStart) {
    if (measureHover) dot(measureHover,color);
    return;
  }
  const end=measureEnd ?? measureHover;
  if (end && distance(measureStart,end)>.00001) {
    const first=screen(measureStart);
    const last=screen(end);
    const pixels=distance(first,last);
    const label=measurementLabel(distance(measureStart,end));
    context.save();
    context.strokeStyle=color;
    context.lineWidth=2;
    if (!measureEnd) context.setLineDash([5,4]);
    stroke(first.x,first.y,last.x,last.y);
    context.setLineDash([]);
    context.font='700 14px DM Sans, sans-serif';
    context.textAlign='center';
    context.textBaseline='middle';
    const width=context.measureText(label).width+18;
    const x=clamp((first.x+last.x)/2+19*(last.y-first.y)/pixels,width/2+5,size.width-width/2-5);
    const y=clamp((first.y+last.y)/2-19*(last.x-first.x)/pixels,16,size.height-16);
    context.fillStyle='#f8fcf9';
    context.lineWidth=1;
    context.beginPath();
    context.roundRect(x-width/2,y-12,width,24,6);
    context.fill();
    context.stroke();
    context.fillStyle=color;
    context.fillText(label,x,y);
    context.restore();
    dot(end,color);
  }
  dot(measureStart,color);
}

function measurementTarget(position,orthogonal) {
  const origin=measureEnd ? null : measureStart;
  return measurePoint(position,origin,measureFaces,{scale:camera.scale,magnetism,orthogonal});
}

function measurementHint() {
  if (measureEnd) return 'Distância de '+measurementLabel(distance(measureStart,measureEnd))+'. Clique para iniciar outra medida.';
  if (measureStart) return 'Clique no ponto final. Use Shift para medir na horizontal ou vertical.';
  return tools.measure[1];
}

function resetMeasure() { measureStart=measureEnd=measureHover=null; }

function setMeasurementPoint(position,orthogonal) {
  const point=measurementTarget(position,orthogonal);
  if (measureStart && !measureEnd) {
    if (distance(measureStart,point)>.00001) measureEnd=point;
  } else {
    measureStart=point;
    measureEnd=null;
  }
  measureHover=null;
  setHint(measurementHint());
  draw();
}

const finishFills={terracotta:'#d9a681',grayTile:'#dfded6',parquet:'#d3b38e',neutral:'#e4d8c3',bathPattern:'#bd8b67',bathClay:'#bd9681'};
function paintRoomFloors(rooms) {
  context.save();
  for (const room of rooms) {
    const a=screen({x:room.left,y:room.top});
    const b=screen({x:room.right,y:room.bottom});
    context.fillStyle=finishFills[room.finish];
    context.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
  }
  context.restore();
}

function furniturePreview(item) {
  return furnitureDrag?.item.id===item.id && furnitureDrag.next ? {...item,...furnitureDrag.next} : item;
}

function furnitureAt(position) {
  const {items}=interiorLayout(project);
  const living=livingRoomFurniture(project);
  if (living) items.push(living.sofa,living.tv);
  return items.reverse().find(item=>{
    const {halfX,halfY}=furnitureFootprint(item);
    const margin=Math.max(.025,4/camera.scale);
    return Math.abs(item.x-position.x)<=halfX+margin && Math.abs(item.y-position.y)<=halfY+margin;
  });
}

function paintRoomItems(rooms,items) {
  context.save();
  for (const entry of items) {
    const item=furniturePreview(entry);
    const p=screen(item);
    const w=item.width*camera.scale, d=item.depth*camera.scale;
    context.save();
    context.translate(p.x,p.y);
    context.rotate(item.rotation*Math.PI/2);
    context.fillStyle=item.kind==='bed' ? '#c99aa7' : item.kind==='table' ? '#8b7c6b' : '#f4ecdf';
    const active=selected?.id===item.id;
    context.strokeStyle=active ? '#147d67' : '#766c5f';
    context.lineWidth=active ? 2 : 1;
    if (item.blocks || item.kind==='chair') context.fillRect(-w/2,-d/2,w,d);
    if (!item.blocks && item.kind!=='chair') context.setLineDash([3,2]);
    context.strokeRect(-w/2,-d/2,w,d);
    context.restore();
  }
  context.fillStyle='#564c40';
  context.font='700 12px DM Sans, sans-serif';
  context.textAlign='center';
  for (const room of rooms) {
    if (!room.label) continue;
    const p=screen({x:(room.left+room.right)/2,y:room.top+(room.bottom-room.top)*.31});
    context.save();
    context.translate(p.x,p.y);
    if (room.name==='Corredor') context.rotate(-Math.PI/2);
    context.fillText(room.name,0,0);
    context.restore();
  }
  context.restore();
}

function paintLivingRoom(drawing) {
  const furniture=livingRoomFurniture(drawing);
  if (!furniture) return;
  const sofa=furniturePreview(furniture.sofa), tv=furniturePreview(furniture.tv);
  const a=screen({x:sofa.x-sofa.width/2,y:sofa.y-sofa.depth/2});
  const b=screen({x:sofa.x+sofa.width/2,y:sofa.y+sofa.depth/2});
  const tvLeft=screen({x:tv.x-tv.width/2,y:tv.y});
  const tvRight=screen({x:tv.x+tv.width/2,y:tv.y});
  context.save();
  context.fillStyle='#a6ad92';
  context.strokeStyle=selected?.id===sofa.id ? '#147d67' : '#586450';
  context.lineWidth=selected?.id===sofa.id ? 2 : 1;
  context.lineWidth=1;
  context.beginPath();
  context.roundRect(a.x,a.y,b.x-a.x,b.y-a.y,3);
  context.fill();
  context.stroke();
  context.fillStyle='#bfc5af';
  const seat=(b.x-a.x)*.37;
  context.fillRect(a.x+seat*.24,a.y+3,seat,(b.y-a.y)*.69);
  context.fillRect(b.x-seat*1.24,a.y+3,seat,(b.y-a.y)*.69);
  const active=selected?.id===tv.id;
  context.fillStyle=active ? '#147d67' : '#293437';
  const height=active ? 6 : 4;
  context.fillRect(tvLeft.x,tvLeft.y-height/2,tvRight.x-tvLeft.x,height);
  context.restore();
}

function exteriorRect(left,top,right,bottom,color) {
  const a=screen({x:left,y:top});
  const b=screen({x:right,y:bottom});
  context.fillStyle=color;
  context.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
}

function paintExterior(exterior) {
  if (!exterior) return;
  const {garage,side}=exterior;
  context.save();
  exteriorRect(garage.left,garage.rear,garage.right,garage.front,'#eed9c9');
  exteriorRect(side.bathroomFace,side.gateY,side.outer,side.recessY,'#e5ecdb');
  exteriorRect(side.kitchenFace,side.recessY,side.outer,side.kitchenEnd,'#e5ecdb');
  if (side.bathroomFace-side.drawnBathroomFace>.001) {
    exteriorRect(side.drawnBathroomFace,side.bathroomRear,side.bathroomFace,side.recessY,'#ece0cf');
  }
  context.strokeStyle='#856b52';
  context.lineWidth=1.5;
  const line=(x1,y1,x2,y2)=>{
    const a=screen({x:x1,y:y1}),b=screen({x:x2,y:y2});
    stroke(a.x,a.y,b.x,b.y);
  };
  line(garage.left,garage.rear,garage.left,garage.front);
  line(side.outer,side.gateY,side.outer,side.kitchenEnd);
  context.setLineDash([5,4]);
  line(garage.left,garage.rear,garage.right,garage.rear);
  line(garage.left,garage.front,garage.right,garage.front);
  line(side.bathroomFace,side.gateY,side.outer,side.gateY);
  line(side.bathroomFace,side.gateY,side.bathroomFace,side.recessY);
  line(side.kitchenFace,side.recessY,side.bathroomFace,side.recessY);
  context.restore();
}

function paintExteriorDimensions(exterior) {
  if (!exterior) return;
  const {garage,side}=exterior;
  const label=(text,x,y)=>{
    const p=screen({x,y});
    context.fillText(text,p.x,p.y);
  };
  const width=(left,right,y)=>({a:{x:left,y},b:{x:right,y},cm:Math.round((right-left)*100)});
  context.save();
  context.textAlign='center';
  context.textBaseline='middle';
  context.font='700 13px DM Sans, sans-serif';
  context.fillStyle='#604637';
  const garageTextY=(garage.rear+garage.front)/2;
  label('Garagem',(garage.left+garage.right)/2,garageTextY);
  context.font='600 11px DM Sans, sans-serif';
  context.textAlign='right';
  label('Portão antigo*',side.outer,side.gateY-.28);
  context.textAlign='center';
  context.font='700 12px DM Sans, sans-serif';
  const transition=width(side.kitchenFace,side.bathroomFace,side.recessY+.38);
  const vertical={
    a:{x:side.outer+.64,y:side.gateY},b:{x:side.outer+.64,y:side.recessY},
    cm:210,display:'2,10 m',reference:true,approximate:true
  };
  paintDimensions([
    width(garage.left,garage.right,garageTextY+.82),
    width(side.bathroomFace,side.outer,side.gateY+.93),
    width(side.kitchenFace,side.outer,side.recessY+1.27),
    transition,vertical
  ]);
  context.restore();
}

function paintSurveyDimensions(visibleProject) {
  const fullSurvey=visibleProject.template==='survey';
  const livingDimensions=livingWindowDimensions(visibleProject);
  const windowDimensions=[...livingDimensions,...kitchenWindowDimensions(visibleProject)];
  const bathroomDimensions=rearBathroomDimensions(visibleProject);
  if (!fullSurvey && !windowDimensions.length && !bathroomDimensions.length) return;
  context.save();
  context.textAlign='center';
  context.textBaseline='middle';
  context.font='700 14px DM Sans, sans-serif';
  context.fillStyle='#234e43';
  if (fullSurvey || livingDimensions.length) {
    const room=screen(livingRoomLabel);
    context.fillText('Sala',room.x,room.y);
  }
  context.font='700 12px DM Sans, sans-serif';
  const dimensions=fullSurvey
    ? [...surveyDimensions,...lowerLeftDoorDimensions(visibleProject),...windowDimensions]
    : [...windowDimensions,...bathroomDimensions];
  paintDimensions(dimensions);
  context.restore();
}

function paintDimensions(dimensions) {
  for (const {a,b,cm,display,reference,approximate,suffix=''} of dimensions) {
    const first=screen(a);
    const last=screen(b);
    const horizontal=a.y===b.y;
    const label=(approximate ? '≈ ' : '')+(display ?? measurementLabel(cm/100))+(reference ? '*' : '')+suffix;
    const color=reference ? '#8b5019' : '#1c7062';
    context.strokeStyle=color;
    context.lineWidth=1;
    context.setLineDash(reference ? [3,3] : []);
    stroke(first.x,first.y,last.x,last.y);
    context.setLineDash([]);
    for (const {x,y} of [first,last]) stroke(x-3,y-3,x+3,y+3);

    context.save();
    const x=(first.x+last.x)/2;
    const y=(first.y+last.y)/2;
    context.translate(x+(horizontal ? 0 : -10),y-(horizontal ? 10 : 0));
    if (!horizontal) context.rotate(-Math.PI/2);
    const width=context.measureText(label).width;
    context.fillStyle='#f8fcf9';
    context.fillRect(-width/2-3,-8,width+6,16);
    context.fillStyle=color;
    context.fillText(label,0,0);
    context.restore();
  }
}

function paintOriginal(reference) {
  const original=project.original;
  if (!original) return;
  original.walls.forEach(wall => paintWall(wall,original.walls,false,reference));
  original.openings.forEach(opening => paintOpening(opening,false,original.walls,reference));
}

function draw() {
  context.clearRect(0,0,size.width,size.height);
  grid();
  updatePlanScale();
  const drawing = wallGroupDrag?.change || wallDrag?.change || project;
  if (drawing===project) paintFootprint();
  const exterior=siteExterior(drawing);
  paintExterior(exterior);
  const interiors=interiorLayout(drawing);
  paintRoomFloors(interiors.rooms);
  if (showOriginal) paintOriginal(true);
  drawing.walls.forEach(wall => paintWall(wall,drawing.walls));
  drawing.openings.forEach(opening => {
    const position = openingDrag?.next?.id===opening.id ? openingDrag.next : opening;
    paintOpening(position,false,drawing.walls);
  });
  paintRoomItems(interiors.rooms,interiors.items);
  paintLivingRoom(drawing);
  const selectedWall = selectedWalls.size===1 ? drawing.walls.find(wall => selectedWalls.has(wall.id)) : null;
  if (selectedWall) {
    wallMeasure(selectedWall);
    if (!multiSelect) for (const point of [selectedWall.a, selectedWall.b]) dot(point, '#23775f');
    if (wallDrag?.change===false) dot(wallDrag.point,'#a64736');
  } else if (drawing===project && project.template==='house') {
    const box = bounds(project);
    wallMeasure({a:{x:box.x,y:box.y},b:{x:box.x+box.width,y:box.y}},24);
    wallMeasure({a:{x:box.x,y:box.y+box.depth},b:{x:box.x,y:box.y}},23);
  }
  if (drawing===project && tool==='select') paintSurveyDimensions(project);
  paintExteriorDimensions(exterior);
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
  if (tool==='measure' && view==='plan') drawMeasurement();
}

function updatePlanScale() {
  if (view !== 'model') $('zoom').value = Math.round(100 * camera.scale / camera.base) + '%';
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
  if (multiSelect || selectedWalls.size!==1) return null;
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
  return hitWall(point);
}

function hitWall(point) {
  const hit=project.walls.map(wall=>projectToWall(point,wall))
    .filter(({wall,distance:gap})=>gap<=Math.max(10/camera.scale,wall.thickness/2+5/camera.scale))
    .sort((a,b)=>a.distance-b.distance)[0];
  return hit ? {id:hit.wall.id,type:'wall'} : null;
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
  if (view === 'model' || ![0,1,2].includes(event.button)) return;
  const p = coordinate(event);
  if ((!editing && tool!=='measure') || tool === 'pan' || event.button !== 0) {
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
  if (tool==='select') {
    selectOnPlan(event,p,pos);
    return;
  }
  if (tool==='measure') {
    setMeasurementPoint(pos,event.shiftKey);
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
  setSelection({id:placed.id,type:placed.type});
  preview = null;
  commit(() => project.openings.push(placed));
});

function selectOnPlan(event,p,position) {
  const endpoint=event.shiftKey ? null : endpointAt(position);
  if (endpoint) {
    wallDrag={...endpoint,origin:p,point:endpoint.wall[endpoint.edge],change:null};
    capture();
    return;
  }
  const furniture=event.shiftKey || multiSelect ? null : furnitureAt(position);
  if (furniture) {
    setSelection({id:furniture.id,type:'furniture',name:furnitureNames[furniture.kind]});
    furnitureDrag={item:furniture,origin:p,next:null};
    capture();
    refresh();
    return;
  }
  const wall=hitWall(position);
  const dragSelection=selectedWalls.size>1 && wall && selectedWalls.has(wall.id);
  const item=event.shiftKey || multiSelect || dragSelection ? wall : hitTest(position);
  if (event.shiftKey || (multiSelect && item?.type==='wall' && !selectedWalls.has(item.id))) {
    if (item?.type==='wall') setSelection(item,true);
    refresh();
    return;
  }
  if (item?.type==='wall') {
    if (!selectedWalls.has(item.id)) setSelection(item);
    wallGroupDrag={origin:p,ids:new Set(selectedWalls),item,moved:false,change:null};
    capture();
  } else {
    setSelection(item);
    if (item) {
      const opening=project.openings.find(entry=>entry.id===item.id);
      const wall=project.walls.find(entry=>entry.id===opening.wallId);
      openingDrag={opening,center:pointAt(wall,opening.t),origin:p,next:null};
      capture();
    }
  }
  refresh();

  function capture() {
    plan.setPointerCapture(event.pointerId);
    plan.style.cursor='grabbing';
  }
}

plan.addEventListener('pointermove', event => {
  const p = coordinate(event);
  if (!editing && tool!=='measure' && !dragging) return;
  if (furnitureDrag) {
    const {item,origin}=furnitureDrag;
    const target={x:item.x+(p.x-origin.x)/camera.scale,y:item.y+(p.y-origin.y)/camera.scale};
    const next=distance(p,origin)<2 ? null : furnitureTarget(project,item,target);
    furnitureDrag.next=next;
    setHint(next ? 'Solte para mover '+furnitureNames[item.kind]+'.' : 'Arraste o móvel para um espaço livre de paredes.');
  } else if (wallGroupDrag) {
    const {origin,ids}=wallGroupDrag;
    if (distance(p,origin)<2) {
      wallGroupDrag.change=null;
    } else {
      wallGroupDrag.moved=true;
      const delta=wallDragDelta({x:(p.x-origin.x)/camera.scale,y:(p.y-origin.y)/camera.scale},magnetism);
      wallGroupDrag.change=moveWallGroup(project,ids,delta);
    }
    setHint(wallGroupDrag.change===false
      ? 'Nessa posição, uma junção se solta ou falta espaço para uma abertura.'
      : 'Solte para mover '+(ids.size===1 ? 'a parede.' : 'as '+ids.size+' paredes selecionadas.'));
  } else if (wallDrag) {
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
    if (tool==='measure') measureHover=measurementTarget(pos,event.shiftKey);
    if (tool==='select') {
      const hit=multiSelect ? hitWall(pos) : furnitureAt(pos) || hitTest(pos);
      plan.style.cursor=hit || endpointAt(pos) ? 'grab' : 'default';
    }
    hover = tool === 'wall' ? snap(pos,event.shiftKey) : null;
    preview = ['door','window'].includes(tool) ? openingAt(pos,tool) : null;
  }
  draw();
});
function endDrag(event) {
  const group=wallGroupDrag;
  const change=group?.change ?? wallDrag?.change;
  const previous=openingDrag?.opening;
  const next=openingDrag?.next;
  const furniture=furnitureDrag;
  dragging=wallDrag=openingDrag=wallGroupDrag=furnitureDrag=null;
  cursor();
  if (event.type==='pointerup' && furniture?.next && distance(furniture.item,furniture.next)>.000001) {
    commit(() => { project.furniturePositions={...project.furniturePositions,[furniture.item.id]:furniture.next}; });
  } else if (event.type==='pointerup' && change) {
    commit(() => { project.walls=change.walls; project.openings=change.openings; },{structure:true});
  } else if (event.type==='pointerup' && group && multiSelect && !group.moved) {
    setSelection(group.item,true);
    refresh();
  } else if (event.type==='pointerup' && next &&
             (next.wallId!==previous.wallId || Math.abs(next.t-previous.t)>.000001)) {
    commit(() => { project.openings=project.openings.map(opening => opening.id===next.id ? next : opening); });
  } else draw();
}
plan.addEventListener('pointerup',endDrag);
plan.addEventListener('pointercancel',endDrag);
plan.addEventListener('pointerleave',() => { if (!dragging && !wallDrag && !openingDrag && !wallGroupDrag && !furnitureDrag) { hover=preview=measureHover=null; draw(); } });
plan.addEventListener('wheel',event => { event.preventDefault(); zoomPlan(Math.exp(-event.deltaY*.001),coordinate(event)); },{passive:false});
plan.addEventListener('contextmenu',event => event.preventDefault());

function cursor() { plan.style.cursor = (!editing && tool!=='measure') || tool==='pan' ? 'grab' : tool==='select' ? 'default' : 'crosshair'; }
function setHint(text) { $('hint').textContent=text; }
function setTool(next) {
  if (view!=='plan' || (!editing && !['select','pan','measure'].includes(next))) return;
  if (next!==tool) {
    start=null;
    resetMeasure();
    if (next==='measure') measureFaces=wallFaces(project.walls);
    if (tool==='wall') placementDefaults.wall.thicknessOverride=null;
  }
  tool=next;
  placementPropertiesOpen=placementTools.includes(next);
  hover=preview=null;
  if (next!=='select') resetSelection();
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

function selectItem(item,type,event) {
  if (view!=='plan') setView('plan');
  const wall=type==='wall' ? item : project.walls.find(candidate => candidate.id===item.wallId);
  if (!wall) return;
  const toggle=type==='wall' && (event.shiftKey || multiSelect);
  if (!toggle) {
    const point=pointAt(wall,type==='wall' ? .5 : item.t);
    camera.x=point.x;
    camera.y=point.y;
  }
  setSelection({id:item.id,type},toggle);
  if (!toggle && matchMedia('(max-width: 600px)').matches) setItems(false);
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
          event => selectItem(entry,type,event));
        row.dataset.itemKey=entry.id;
        if (selected?.id===entry.id || selectedWalls.has(entry.id)) row.setAttribute('aria-current','true');
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
  if (view==='plan' && selectedWalls.size>1) {
    $('inspector').hidden=false;
    $('inspector-title').textContent='Paredes selecionadas';
    panel.innerHTML='<div class="property-kind"><i>'+icon('wall')+'</i>'+selectedWalls.size+' paredes</div>'+
      '<p class="type-note">Arraste o corpo de uma das paredes para mover o conjunto.</p>';
    renderMultiSelect(panel);
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
  if (selected.type==='wall') renderMultiSelect(panel);
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

function renderMultiSelect(panel) {
  const button=document.createElement('button');
  button.type='button';
  button.className='plain multi-select';
  button.textContent='Seleção múltipla';
  button.setAttribute('aria-pressed',String(multiSelect));
  button.onclick=() => {
    multiSelect=!multiSelect;
    refresh();
    $('properties').querySelector('.multi-select')?.focus();
  };
  const removeButton=panel.querySelector('#remove-selection');
  if (removeButton) removeButton.before(button);
  else panel.append(button);
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
  if (!selected || selected.type==='furniture' || selectedWalls.size>1 || view!=='plan') return;
  const {id,type} = selected;
  setSelection(null);
  commit(() => {
    if (type==='wall') project.walls=project.walls.filter(wall => wall.id!==id);
    project.openings=project.openings.filter(opening => opening.id!==id && opening.wallId!==id);
  },{structure:type==='wall'});
}

function refresh() {
  const isPlan = view==='plan';
  const visibleProject=project;
  $('project-name').readOnly=true;
  $('project-name').value=project.name;
  $('project-count').textContent=visibleProject
    ? visibleProject.walls.length+' paredes · '+visibleProject.openings.length+' aberturas' : '';
  $('mode').textContent=isPlan ? tools[tool][0] : 'Navegação 3D';
  let hint=tools[tool][1];
  if (tool==='measure') hint=measurementHint();
  if (tool==='window') hint=activeWindowType().name+' · clique em uma parede.';
  if (tool==='wall' && placementDefaults.wall.length!==null)
    hint=start ? 'Clique na direção da parede para aplicar o comprimento fixo.' : 'Clique no ponto inicial da parede.';
  if (tool==='select' && selected?.type==='wall') {
    if (multiSelect) hint='Clique em outros trechos para incluir. Arraste uma parede selecionada para mover.';
    else if (selectedWalls.size>1) hint='Arraste uma das paredes selecionadas. Shift + clique adiciona ou remove trechos.';
    else hint='Arraste o corpo para mover ou uma ponta para esticar. Shift + clique seleciona mais paredes.';
  }
  if (tool==='select' && selected && selected.type!=='wall') hint=selected.type==='furniture'
    ? selected.name+' selecionado. Arraste para mudar a posição.'
    : 'Arraste o item para outro trecho de parede.';
  if (isPlan && !editing && tool==='select') {
    hint=optionId ? 'Estudo de layout · navegue ou alterne para 3D.' : stageId ? 'Arraste para navegar. Use Editar etapa para alterar o desenho.' : 'Planta original · arraste para navegar.';
  }
  setHint(isPlan ? hint : 'Arraste para girar e role para aproximar ou afastar.');
  $('plan-button').setAttribute('aria-pressed',String(isPlan));
  $('model-button').setAttribute('aria-pressed',String(view==='model'));
  $('original-actions').hidden=!isPlan || !stageId;
  const eye=$('toggle-original');
  eye.hidden=!isPlan || !stageId;
  eye.setAttribute('aria-pressed',String(Boolean(showOriginal && project.original)));
  eye.innerHTML=icon(showOriginal ? 'eye' : 'eyeOff');
  eye.title=showOriginal ? 'Ocultar planta original' : 'Mostrar planta original';
  $('survey-notes').hidden=view==='model' || !visibleProject ||
    (visibleProject.template!=='survey' && !livingWindowDimensions(visibleProject).length &&
      !kitchenWindowDimensions(visibleProject).length && !siteExterior(visibleProject));
  $('orientation').hidden=view==='model';
  $('scale-bar').hidden=view==='model';
  $('empty').hidden=project.walls.length>0 || !isPlan || tool!=='select';
  $('undo').disabled=!past.length || !editing;
  $('redo').disabled=!future.length || !editing;
  $('items-toggle').disabled=!editing;
  $('magnetism').disabled=!isPlan;
  $('magnetism').setAttribute('aria-pressed',String(magnetism));
  $('magnetism').title='Magnetismo '+(magnetism?'ligado':'desligado')+' (G)';
  document.querySelectorAll('[data-tool]').forEach(button => {
    button.disabled=!isPlan || (!editing && !['select','pan','measure'].includes(button.dataset.tool));
    button.setAttribute('aria-pressed',String(isPlan && button.dataset.tool===tool));
  });
  inspector();
  renderItems();
  if (view!=='model') draw();
  else model?.setProject(project);
  updateModelControls();
}

function updateModelControls() {
  const visible=view==='model' && Boolean(model);
  const walking=visible && model.walking;
  const kitchen=visible && model.hasKitchenView;
  $('model-controls').hidden=!visible;
  $('kitchen-view').hidden=!kitchen;
  $('garage-view').hidden=!visible || !model.hasExterior;
  $('pick-kitchen-photo').hidden=!kitchen;
  if (!kitchen) $('kitchen-photo-status').hidden=true;
  $('walk-directions').hidden=!walking;
  $('model').toggleAttribute('data-walking',walking);
  const walkButton=$('walk-view');
  walkButton.setAttribute('aria-pressed',String(walking));
  walkButton.textContent=walking ? 'Voltar ao 3D' : 'Andar pela casa';
  if (walking) {
    $('mode').textContent='Caminhada';
    setHint('Segure uma seta para andar. Arraste a vista para olhar.');
  } else if (visible) {
    $('mode').textContent='Navegação 3D';
    setHint('Arraste para girar e role para aproximar ou afastar.');
  }
}

function showKitchenPhotoStatus(message) {
  const status=$('kitchen-photo-status');
  status.textContent=message;
  status.hidden=!message;
}

async function jpegForKitchenPhoto(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    const scale=Math.min(1,960/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.84);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadKitchenPhoto(url) {
  const image=new Image();
  image.src=url;
  await image.decode();
  model.setKitchenPhoto(image,url===defaultKitchenPhoto);
  $('pick-kitchen-photo').textContent='Trocar foto da janela';
}

async function restoreKitchenPhoto() {
  const picker=$('pick-kitchen-photo');
  picker.disabled=true;
  try {
    let saved;
    try { saved=localStorage.getItem(kitchenPhotoKey); } catch {}
    if (saved) {
      try {
        await loadKitchenPhoto(saved);
        return;
      } catch {}
    }
    await loadKitchenPhoto(defaultKitchenPhoto);
  } catch {
    showKitchenPhotoStatus('Não foi possível carregar a foto da janela. Escolha uma foto do aparelho.');
  } finally {
    picker.disabled=false;
  }
}

async function setView(next) {
  if (view===next) return;
  clearWalkInput();
  const turn=++viewChange;
  view=next;
  start=hover=preview=null;
  resetSelection();
  const isModel=next==='model';
  plan.hidden=isModel;
  $('model').hidden=!isModel;
  cursor();
  refresh();
  if (!isModel) {
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
    const { createModel }=await import('./model.mjs?v=20261126-opcoes');
    if (turn!==viewChange) return;
    host.replaceChildren();
    model=createModel(host,value => { if (view==='model') $('zoom').value=Math.round(value*100)+'%'; });
    model.setProject(project);
    updateModelControls();
    restoreKitchenPhoto();
    model.fit();
    model.resume();
  } catch (error) {
    if (turn!==viewChange) return;
    console.error(error);
    host.innerHTML='<div class="model-error" role="status">O navegador não conseguiu abrir a vista 3D. A planta 2D está disponível.</div>';
  }
}

function zoom(factor) {
  if (view!=='model') zoomPlan(factor);
  else model?.changeZoom(factor);
}

$('plan-button').onclick=() => setView('plan');
$('model-button').onclick=() => setView('model');
$('walk-view').onclick=() => changeWalkMode(!model?.walking);
$('kitchen-view').onclick=() => changeWalkMode(true,true);
$('garage-view').onclick=() => changeWalkMode(true,'garage');
$('pick-kitchen-photo').onclick=() => $('kitchen-photo').click();
$('kitchen-photo').onchange=async event => {
  const input=event.currentTarget;
  const file=input.files[0];
  if (!file || !model) return;
  const picker=$('pick-kitchen-photo');
  picker.disabled=true;
  showKitchenPhotoStatus('Preparando a foto…');
  try {
    const photo=await jpegForKitchenPhoto(file);
    await loadKitchenPhoto(photo);
    try {
      localStorage.setItem(kitchenPhotoKey,photo);
      showKitchenPhotoStatus('Foto salva neste aparelho.');
    } catch {
      showKitchenPhotoStatus('Foto disponível enquanto esta página estiver aberta.');
    }
  } catch {
    showKitchenPhotoStatus('Não foi possível abrir a foto. Experimente um arquivo JPEG ou PNG.');
  } finally {
    picker.disabled=false;
    input.value='';
  }
};
$('toggle-original').onclick=() => {
  showOriginal=!showOriginal;
  refresh();
};
$('fit').onclick=() => view!=='model' ? fitPlan() : model?.fit();
$('zoom-in').onclick=() => zoom(1.2);
$('zoom-out').onclick=() => zoom(1/1.2);
$('undo').onclick=() => history(past,future);
$('redo').onclick=() => history(future,past);
document.querySelectorAll('[data-tool]').forEach(button => { button.onclick=() => setTool(button.dataset.tool); });
$('close-properties').onclick=() => {
  if (placementTools.includes(tool)) placementPropertiesOpen=false;
  else resetSelection();
  refresh();
};
$('items-toggle').onclick=() => setItems(!itemsOpen);
$('magnetism').onclick=() => {
  magnetism=!magnetism;
  hover=preview=null;
  refresh();
  if (tool==='measure') setHint(magnetism ? 'Magnetismo ligado para encaixar nas faces das paredes.' : 'Magnetismo desligado.');
  else setHint(magnetism ? 'Magnetismo ligado. Comprimentos de 10 em 10 cm.' : 'Magnetismo desligado.');
};
$('close-items').onclick=() => { setItems(false); $('items-toggle').focus(); };
$('placed-items').onclick=() => setItems(true,'placed');
$('catalog-items').onclick=() => setItems(true,'catalog');
for (const {id,title} of kitchenOptions) {
  const button=document.createElement('button');
  button.type='button';
  button.className='plain';
  button.dataset.option=id;
  button.textContent=title;
  button.onclick=()=>{ if (!savingStage && discardDraft()) displayStage(null,id); };
  $('kitchen-options').append(button);
}
$('edit-stage').onclick=()=>editStage(false);
$('add-stage').onclick=()=>editStage(true);
$('cancel-stage').onclick=()=>{ if (discardDraft()) displayStage(stageId); };
$('save-stage').onclick=saveStage;
$('review-dialog').onclose=()=>{
  if ($('review-dialog').returnValue==='apply') commitStage();
  else review=null;
};

$('survey-notes').onclick=() => {
  $('survey-door-a').textContent=unit.format(surveyDoors.aWidth)+' cm de largura × '+unit.format(surveyDoors.aHeight)+' cm de altura';
  $('survey-door-b').textContent=unit.format(surveyDoors.bWidth)+' cm de largura';
  $('survey-dialog').showModal();
};
const walkKeys={
  w:'forward',arrowup:'forward',s:'back',arrowdown:'back',
  a:'left',arrowleft:'left',d:'right',arrowright:'right'
};
const heldDirections=new Map();
const walkButtons=[...document.querySelectorAll('[data-walk]')];
let lookDrag=null;

function syncWalkInput() {
  const held=new Set(heldDirections.values());
  model?.setWalkInput(Number(held.has('forward'))-Number(held.has('back')),
    Number(held.has('right'))-Number(held.has('left')));
  for (const button of walkButtons) button.toggleAttribute('data-held',held.has(button.dataset.walk));
}

function clearWalkInput() {
  heldDirections.clear();
  lookDrag=null;
  syncWalkInput();
}

function changeWalkMode(active, destination=false) {
  if (view!=='model' || !model) return;
  clearWalkInput();
  model.setWalking(active,destination);
  updateModelControls();
}

for (const button of walkButtons) {
  button.addEventListener('pointerdown',event => {
    if (!model?.walking || event.button!==0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    heldDirections.set(event.pointerId,button.dataset.walk);
    syncWalkInput();
  });
  for (const end of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(end,event => {
      if (heldDirections.delete(event.pointerId)) syncWalkInput();
    });
  }
  button.addEventListener('click',event => {
    if (event.detail!==0 || !model?.walking) return;
    heldDirections.set(button,button.dataset.walk);
    syncWalkInput();
    setTimeout(() => {
      if (heldDirections.delete(button)) syncWalkInput();
    },180);
  });
  button.addEventListener('contextmenu',event => event.preventDefault());
}

const modelHost=$('model');
modelHost.addEventListener('pointerdown',event => {
  if (!model?.walking || lookDrag || event.button!==0) return;
  modelHost.setPointerCapture(event.pointerId);
  lookDrag={id:event.pointerId,x:event.clientX,y:event.clientY};
});
modelHost.addEventListener('pointermove',event => {
  if (lookDrag?.id!==event.pointerId) return;
  model.lookWalk(event.clientX-lookDrag.x,event.clientY-lookDrag.y);
  lookDrag.x=event.clientX;
  lookDrag.y=event.clientY;
});
for (const end of ['pointerup','pointercancel','lostpointercapture']) {
  modelHost.addEventListener(end,event => {
    if (lookDrag?.id===event.pointerId) lookDrag=null;
  });
}
window.addEventListener('blur',clearWalkInput);
document.addEventListener('visibilitychange',() => {
  if (document.hidden) clearWalkInput();
});
document.addEventListener('keyup',event => {
  if (heldDirections.delete(event.key.toLowerCase())) syncWalkInput();
});

document.addEventListener('keydown',event => {
  if (!remodel || event.target.matches('input,select,textarea') || $('review-dialog').open || $('survey-dialog').open) return;
  const key=event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && ['z','y'].includes(key)) {
    event.preventDefault();
    if (key==='y' || event.shiftKey) history(future,past);
    else history(past,future);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (view==='model' && model?.walking) {
    if (key==='escape') changeWalkMode(false);
    else if (Object.hasOwn(walkKeys,key)) {
      event.preventDefault();
      heldDirections.set(key,walkKeys[key]);
      syncWalkInput();
    }
    return;
  }
  if (key==='i' && editing) { setItems(!itemsOpen); return; }
  if (view!=='plan') return;
  if (key==='g') { $('magnetism').click(); return; }
  const shortcuts={v:'select',p:'wall',d:'door',j:'window',r:'measure',m:'pan'};
  if (shortcuts[key]) setTool(shortcuts[key]);
  else if (key==='escape') { start=hover=preview=null; resetSelection(); resetMeasure(); cursor(); refresh(); }
  else if (['delete','backspace'].includes(key) && selected) { event.preventDefault(); remove(); }
});

new ResizeObserver(resize).observe(stage);
document.fonts?.ready.then(draw);
$('share').hidden=true;
$('access-form').onsubmit=event=>{
  event.preventDefault();
  const input=$('access-link');
  let code;
  try { code=projectCode(new URL(input.value).hash); } catch {}
  input.setCustomValidity(code ? '' : 'Use o link da reforma que termina com #p= e o código de acesso.');
  if (!input.reportValidity()) return;
  location.hash='p='+code;
  location.reload();
};
$('access-link').oninput=event=>event.target.setCustomValidity('');
window.addEventListener('beforeunload',event=>{
  if (editing && (past.length || $('stage-name').value.trim()!==editing.title)) event.preventDefault();
});
sync=startSync({
  applyRemote,
  isBusy:()=>Boolean(editing || savingStage || dragging || $('survey-dialog').open),
  status:syncStatus,
  unavailable:message=>{ $('access-message').textContent=message; }
});
$('share').onclick=async ()=>{
  const url=sync.link();
  if (!url) return;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({title:'Traço Planta – '+project.name,url});
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Link compartilhado copiado.');
  } catch (error) {
    if (error?.name!=='AbortError') window.prompt('Copie este link e abra no outro aparelho:',url);
  }
};
