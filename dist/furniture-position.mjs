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

export function positionedFurniture(project,item) {
  const saved=project.furniturePositions?.[item.id];
  if (saved?.hidden) return null;
  const next={...item,rotation:Number.isFinite(saved?.rotation)?saved.rotation:item.rotation};
  const target=furnitureTarget(project,next,saved);
  return target ? {...next,...target} : next;
}

export function customFurniture(project) {
  return Object.entries(project.furniturePositions??{})
    .filter(([,item])=>item.kind==='block' && !item.hidden)
    .map(([id,item])=>({...item,id,blocks:true}));
}

export const furnitureNames={
  block:'Móvel simples',sofa:'Sofá',tv:'TV',sink:'Pia',stove:'Fogão',fridge:'Geladeira',
  table:'Mesa',chair:'Cadeira',wallCabinet:'Armário aéreo',cabinet:'Armário',
  bed:'Cama',nightstand:'Criado-mudo',dresser:'Cômoda',wardrobe:'Guarda-roupa',
  toilet:'Vaso sanitário',bathSink:'Lavatório',cistern:'Caixa de descarga',
  desk:'Escrivaninha',wardrobeWhite:'Armário branco',shelves:'Prateleiras',sewing:'Mesa de costura'
};
