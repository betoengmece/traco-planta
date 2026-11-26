import { validateOpening } from './geometry.mjs';

const collections=['walls','openings','windowTypes'];
const fields=['name','template','example','wallThickness','furniturePositions','kitchenOption',...collections];
const plain=value=>value!==null && typeof value==='object' && !Array.isArray(value);

function layout(data) {
  return Object.fromEntries(fields.filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]));
}

export function renovation(data) {
  return {
    original:layout(data.original?.walls && Array.isArray(data.stages) ? data.original : data),
    surveyed:Boolean(data.surveyed || data.template==='survey' || data.original?.template==='survey' || data.original?.surveyed),
    stages:Array.isArray(data.stages) ? data.stages : []
  };
}

export function sharedRenovation(document) {
  return {...document.original,surveyed:document.surveyed,original:document.original,stages:document.stages};
}

function records(plan) {
  const result=layout(plan);
  for (const kind of collections) {
    result[kind]=Object.fromEntries((result[kind]??[]).map(item=>[item.id,item]));
  }
  result.furniturePositions??={};
  return result;
}

function planFrom(record) {
  const result={...record};
  for (const kind of collections) result[kind]=Object.values(result[kind]);
  return result;
}

function differences(before,after,path,ops) {
  if (Object.is(before,after)) return;
  if (plain(before) && plain(after)) {
    for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      differences(Object.hasOwn(before,key)?before[key]:undefined,
        Object.hasOwn(after,key)?after[key]:undefined,[...path,key],ops);
    }
  } else {
    const change={path};
    if (before!==undefined) change.before=before;
    if (after!==undefined) change.after=after;
    ops.push(change);
  }
}

export function planChanges(before,after) {
  const ops=[];
  differences(records(before),records(after),[],ops);
  return ops;
}

function same(before,after) {
  const ops=[];
  differences(before,after,[],ops);
  return ops.length===0;
}

function applyChange(record,{path,before,after}) {
  let parent=record;
  for (const segment of path.slice(0,-1)) {
    if (!Object.hasOwn(parent,segment) || !plain(parent[segment])) return after===undefined;
    parent=parent[segment];
  }
  const leaf=path.at(-1);
  if (leaf===undefined) return false;
  const current=Object.hasOwn(parent,leaf)?parent[leaf]:undefined;
  if (same(current,after)) return true;
  if (!same(current,before)) return false;
  if (after===undefined) delete parent[leaf];
  else Object.defineProperty(parent,leaf,{value:structuredClone(after),writable:true,configurable:true,enumerable:true});
  return true;
}

function invalidOpenings(plan) {
  const walls=new Map(plan.walls.map(wall=>[wall.id,wall]));
  const types=new Set((plan.windowTypes??[]).map(type=>type.id));
  return plan.openings.filter(opening=>
    !validateOpening(opening,walls.get(opening.wallId),plan.openings) ||
    (opening.type==='window' && opening.typeId && !types.has(opening.typeId)));
}

function replay(previous, ops) {
  const preexisting=new Set(invalidOpenings(previous).map(opening=>opening.id));
  const excluded=new Set();
  const conflicts=[];
  for (;;) {
    const state=structuredClone(records(previous));
    const mismatches=[];
    for (const op of ops) {
      if (!excluded.has(op) && !applyChange(state,op)) mismatches.push(op);
    }
    const plan=planFrom(state);
    const invalid=invalidOpenings(plan).find(opening=>!preexisting.has(opening.id));
    if (!invalid) {
      for (const {path} of mismatches) conflicts.push({path});
      return {plan,conflicts};
    }
    const previousOpening=previous.openings.find(opening=>opening.id===invalid.id);
    const incompatible=op=>!excluded.has(op) && !mismatches.includes(op);
    const modifyOpening=op=>op.path[0]==='openings' && op.path[1]===invalid.id;
    const related=op=>{
      const [kind,id]=op.path;
      if (kind==='walls') return id===invalid.wallId || id===previousOpening?.wallId;
      if (kind==='windowTypes') return id===invalid.typeId;
      if (kind==='openings') {
        return plan.openings.some(opening=>opening.id===id && opening.wallId===invalid.wallId);
      }
      return false;
    };
    const group=ops.filter(op=>incompatible(op) && modifyOpening(op));
    if (!group.length) group.push(...ops.filter(op=>incompatible(op) && related(op)));
    if (!group.length) {
      return {plan:previous,conflicts:[...conflicts,{path:['openings',invalid.id],opening:invalid}]};
    }
    group.forEach(op=>excluded.add(op));
    conflicts.push({path:['openings',invalid.id],opening:invalid});
  }
}

export function stagePlans(document) {
  const plans=[document.original];
  for (const stage of document.stages) plans.push(replay(plans.at(-1),stage.ops).plan);
  return plans;
}

export function reviewStage(document,id,title,draft) {
  const oldPlans=stagePlans(document);
  const index=document.stages.findIndex(stage=>stage.id===id);
  const editingOriginal=id===null;
  const at=editingOriginal ? -1 : index<0 ? document.stages.length : index;
  const stages=editingOriginal ? [] : document.stages.slice(0,at);
  let previous=layout(draft);
  const original=editingOriginal ? previous : document.original;
  if (!editingOriginal) stages.push({id,title,ops:planChanges(oldPlans[at],draft)});
  const conflicts=[];
  const impacted=[];
  for (let i=at+1;i<document.stages.length;i++) {
    const stage=document.stages[i];
    const result=replay(previous,stage.ops);
    stages.push({...stage,ops:planChanges(previous,result.plan)});
    if (planChanges(oldPlans[i+1],result.plan).length) impacted.push(stage);
    for (const conflict of result.conflicts) conflicts.push({...conflict,stage,number:i+1});
    previous=result.plan;
  }
  return {document:{...document,original,stages},impacted,conflicts};
}
