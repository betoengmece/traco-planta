import { clamp, length } from './geometry.mjs';

export function furnitureFootprint(item) {
  return item.rotation%2
    ? {halfX:item.depth/2,halfY:item.width/2}
    : {halfX:item.width/2,halfY:item.depth/2};
}

export function furnitureTarget(project,item,position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
  const x=item.slide?.axis==='x' ? clamp(position.x,item.slide.min,item.slide.max) : item.slide ? item.x : position.x;
  const y=item.slide?.axis==='y' ? clamp(position.y,item.slide.min,item.slide.max) : item.slide ? item.y : position.y;
  const {halfX,halfY}=furnitureFootprint(item);
  const blocked=project.walls.some(wall=>{
    const span=length(wall);
    if (!span) return false;
    const ux=(wall.b.x-wall.a.x)/span, uy=(wall.b.y-wall.a.y)/span;
    const half=wall.thickness/2;
    const dx=x-(wall.a.x+wall.b.x)/2, dy=y-(wall.a.y+wall.b.y)/2;
    const overlapsX=Math.abs(dx)<halfX+Math.abs(ux)*span/2+Math.abs(uy)*half;
    const overlapsY=Math.abs(dy)<halfY+Math.abs(uy)*span/2+Math.abs(ux)*half;
    const overlapsAlong=Math.abs(dx*ux+dy*uy)<span/2+Math.abs(ux)*halfX+Math.abs(uy)*halfY;
    const overlapsAcross=Math.abs(-dx*uy+dy*ux)<half+Math.abs(uy)*halfX+Math.abs(ux)*halfY;
    return overlapsX && overlapsY && overlapsAlong && overlapsAcross;
  });
  return blocked ? null : {x,y};
}

export function positionedFurniture(project,item) {
  const target=furnitureTarget(project,item,project.furniturePositions?.[item.id]);
  return target ? {...item,...target} : item;
}

export const furnitureNames={
  sofa:'Sofá',tv:'TV',sink:'Pia',stove:'Fogão',fridge:'Geladeira',
  table:'Mesa',chair:'Cadeira',wallCabinet:'Armário aéreo',cabinet:'Armário',
  bed:'Cama',nightstand:'Criado-mudo',dresser:'Cômoda',wardrobe:'Guarda-roupa',
  desk:'Escrivaninha',wardrobeWhite:'Armário branco',shelves:'Prateleiras',sewing:'Mesa de costura'
};
