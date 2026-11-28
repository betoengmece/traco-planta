import { length } from './geometry.mjs';

function furnitureAxes(rotation) {
  const angle=(rotation??0)*Math.PI/2;
  return [[Math.cos(angle),-Math.sin(angle)],[Math.sin(angle),Math.cos(angle)]];
}

export function furnitureContains(item,position,margin=0) {
  const x=position.x-item.x, y=position.y-item.y;
  const [along,across]=furnitureAxes(item.rotation);
  return Math.abs(x*along[0]+y*along[1])<=item.width/2+margin &&
    Math.abs(x*across[0]+y*across[1])<=item.depth/2+margin;
}

export function furnitureTarget(project,item,position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
  const {x,y}=position;
  const [a,b]=furnitureAxes(item.rotation);
  const blocked=project.walls.some(wall=>{
    const span=length(wall);
    if (!span) return false;
    const u=[(wall.b.x-wall.a.x)/span,(wall.b.y-wall.a.y)/span];
    const v=[-u[1],u[0]];
    const dx=x-(wall.a.x+wall.b.x)/2,dy=y-(wall.a.y+wall.b.y)/2;
    const dot=(p,q)=>Math.abs(p[0]*q[0]+p[1]*q[1]);
    return [a,b,u,v].every(axis=>{
      const reach=(dot(axis,a)*item.width+dot(axis,b)*item.depth+
        dot(axis,u)*span+dot(axis,v)*wall.thickness)/2;
      return Math.abs(axis[0]*dx+axis[1]*dy)<reach-1e-6;
    });
  });
  return blocked ? null : {x,y};
}

export function furnitureGroupTargets(project,items,delta) {
  const targets=new Map();
  for (const item of items) {
    const target=furnitureTarget(project,item,{x:item.x+delta.x,y:item.y+delta.y});
    if (!target) return null;
    targets.set(item.id,target);
  }
  return targets;
}

export function furnitureGroupId(project,itemId) {
  const id=project.furniturePositions?.[itemId]?.groupId;
  return id && Object.hasOwn(project.furnitureGroups??{},id) ? id : null;
}

export function positionedFurniture(project,item) {
  const saved=project.furniturePositions?.[item.id];
  if (saved?.hidden) return null;
  const next={...item,rotation:Number.isFinite(saved?.rotation)?saved.rotation:item.rotation};
  const target=furnitureTarget(project,next,saved);
  return target ? {...next,...target} : next;
}

export function customFurniture(project) {
  return Object.entries(project.furniturePositions??{})
    .filter(([id,item])=>id.startsWith('movel:') && Object.hasOwn(furnitureNames,item.kind) && !item.hidden)
    .map(([id,item])=>({...item,id,blocks:item.blocks??true}));
}

export const furnitureNames={
  block:'Móvel simples',singleBed:'Cama de solteiro',crib:'Berço',smallCabinet:'Armarinho',shoeRack:'Sapateira',sofa:'Sofá',tv:'TV',sink:'Pia',stove:'Fogão',fridge:'Geladeira',
  table:'Mesa',chair:'Cadeira',wallCabinet:'Armário aéreo',cabinet:'Armário',
  bed:'Cama',nightstand:'Criado-mudo',dresser:'Cômoda',wardrobe:'Guarda-roupa',
  toilet:'Vaso sanitário',bathSink:'Lavatório',cistern:'Caixa de descarga',
  desk:'Escrivaninha',wardrobeWhite:'Armário branco',shelves:'Prateleiras',sewing:'Mesa de costura'
};


export const furnitureCatalog=[
  ['block',.60,.60,.60],['wardrobe',1.60,.60,1.98],['cabinet',.80,.60,.90],
  ['wallCabinet',.80,.35,.59],['table',1.20,.75,.75],['chair',.44,.48,.89],
  ['stove',.60,.60,.90],['sink',.90,.60,.90],['fridge',.65,.65,1.74],
  ['bed',1.38,1.88,.60],['singleBed',.88,1.88,.60],['crib',.76,1.42,.96],
  ['smallCabinet',.55,.36,.75],['shoeRack',.75,.32,.88],['nightstand',.40,.38,.50]
].map(([kind,width,depth,height])=>({kind,width,depth,height,rotation:0,blocks:kind!=='wallCabinet'}));

export function furnitureCopy(item) {
  const {kind,width,depth,height,elevation,rotation,blocks}=item;
  return {kind,width,depth,height,elevation,rotation,blocks:blocks??!['tv','chair','wallCabinet'].includes(kind)};
}
