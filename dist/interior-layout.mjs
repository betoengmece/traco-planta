import { customFurniture, positionedFurniture } from './furniture-position.mjs?v=20261126-catalogo';

// The photographed rooms are located by the adjoining walls and window in the survey.
export function interiorLayout(project) {
  const walls=new Map(project.walls.map(wall=>[wall.id,wall]));
  const rooms=[];
  const items=[];
  const identities=new Map();
  function horizontal(id) {
    const wall=walls.get(id);
    return wall && wall.a.y===wall.b.y ? wall : null;
  }
  function vertical(id) {
    const wall=walls.get(id);
    return wall && wall.a.x===wall.b.x ? wall : null;
  }
  function room(name,left,right,top,bottom,finish,ceiling,label=true) {
    if ([left,right,top,bottom].some(value=>!Number.isFinite(value)) || right-left<.35 || bottom-top<.35) return null;
    const bounds={name,left,right,top,bottom,finish,ceiling,label};
    rooms.push(bounds);
    return bounds;
  }
  function item(kind,room,x,y,width,depth,rotation=0,blocks=true) {
    const crossed=rotation%2!==0;
    const halfX=(crossed ? depth : width)/2;
    const halfY=(crossed ? width : depth)/2;
    if (x-halfX<room.left || x+halfX>room.right || y-halfY<room.top || y+halfY>room.bottom) return;
    const baseId=room.name+':'+kind;
    const count=(identities.get(baseId)??0)+1;
    identities.set(baseId,count);
    const id=count===1 ? baseId : baseId+':'+count;
    const furniture=positionedFurniture(project,{id,kind,x,y,width,depth,rotation,blocks});
    if (furniture) items.push(furniture);
  }

  const kitchenWall=vertical('right-main');
  const kitchenLeft=vertical('middle-divider');
  const kitchenTop=horizontal('annex-bottom');
  const kitchenBottom=horizontal('strip-top');
  const option=project.kitchenOption;
  const integrated=option==='integrada' && !walls.has('left-cross');
  const corridorEdge=vertical('strip-side');
  const divider=vertical('proposal-bedroom-divider') ?? (integrated && project.walls.find(wall=>
    corridorEdge && wall.id!==corridorEdge.id && Math.abs(wall.a.x-corridorEdge.a.x)<.01 &&
    Math.abs(wall.a.x-wall.b.x)<.01 && Math.min(wall.a.y,wall.b.y)<=kitchenTop?.a.y &&
    Math.max(wall.a.y,wall.b.y)>=kitchenBottom?.a.y));
  const swap=Boolean(divider && (integrated || option==='linear' || option==='l'));
  const window=project.openings.find(opening=>opening.wallId===kitchenWall?.id && opening.type==='window');
  if (kitchenWall && kitchenLeft && kitchenTop && kitchenBottom) {
    const kitchen=swap ? null : room('Cozinha',kitchenLeft.a.x,kitchenWall.a.x,kitchenTop.a.y,kitchenBottom.a.y,'terracotta','slats');
    if (swap) {
      room('Corredor',kitchenLeft.a.x,divider.a.x,kitchenTop.a.y,kitchenBottom.a.y,'parquet','slats');
      const next=room('Quarto',divider.a.x,kitchenWall.a.x,kitchenTop.a.y,kitchenBottom.a.y,'grayTile','slats');
      if (next && !integrated) {
        const {left,right,top,bottom}=next;
        item('bed',next,right-.95,bottom-1.05,1.38,1.88,2);
        item('wardrobe',next,left+.76,top+.39,1.24,.60);
        item('nightstand',next,right-.22,bottom-.33,.25,.36,2);
      }
    }
    if (kitchen && kitchen.right-kitchen.left>=2.9 && kitchen.bottom-kitchen.top>=2.8) {
      const {left,right,top,bottom}=kitchen;
      const windowY=window ? kitchenWall.a.y+(kitchenWall.b.y-kitchenWall.a.y)*window.t : (top+bottom)/2;
      const counterY=Math.min(bottom-1.32,Math.max(top+.82,windowY));
      if (option==='current') {
        item('sink',kitchen,right-.38,counterY,.90,.60,3);
        item('cabinet',kitchen,right-.38,counterY-.75,.60,.60,3);
        item('stove',kitchen,right-.38,counterY+.80,.60,.60,3);
        item('fridge',kitchen,right-1.64,bottom-.44,.65,.65,2);
        item('wallCabinet',kitchen,right-.25,bottom-.48,.62,.35,3,false);
        item('table',kitchen,left+.42,(top+bottom)/2+.40,1,.60,1);
      } else {
        item('sink',kitchen,right-.40,counterY,1.36,.60,3);
        item('stove',kitchen,right-.40,counterY+1.03,.56,.60,3);
        item('fridge',kitchen,right-1.52,top+.43,.65,.65);
        item('table',kitchen,left+.53,(top+bottom)/2,1.04,.72,1);
        item('chair',kitchen,left+.55,(top+bottom)/2-.73,.38,.39,2,false);
        item('wallCabinet',kitchen,left+.30,(top+bottom)/2,1.26,.34,1,false);
        item('cabinet',kitchen,right-1.43,bottom-.33,.92,.43,2);
      }
    }
    const nook=vertical('annex-lower');
    const nookTop=horizontal('entry');
    if (nook && nookTop) room(swap ? 'Corredor' : 'Cozinha',kitchenLeft.a.x,nook.a.x,nookTop.a.y,kitchenTop.a.y,swap ? 'parquet' : 'terracotta','slats',false);
    const hallRight=vertical('strip-side');
    const hallEnd=horizontal('rear-entry');
    if (hallRight && hallEnd) room('Corredor',kitchenLeft.a.x,hallRight.a.x,kitchenBottom.a.y,hallEnd.a.y,'parquet','slats');
  }

  const bedroomLeft=vertical('left-upper');
  const bedroomRight=vertical('upper-divider');
  const bedroomTop=horizontal('top-left');
  const bedroomEnd=horizontal('left-cross');
  if (integrated && bedroomLeft && bedroomRight && bedroomTop) {
    const end=horizontal('left-base');
    if (end) room('Cozinha',bedroomLeft.a.x,bedroomRight.a.x,bedroomTop.a.y,end.a.y,'terracotta','slats');
  }
  if (bedroomLeft && bedroomRight && bedroomTop && bedroomEnd) {
    if (swap) {
      const next=room('Cozinha',bedroomLeft.a.x,bedroomRight.a.x,bedroomTop.a.y,bedroomEnd.a.y,'terracotta','slats');
      if (next) {
        const {left,top,bottom}=next;
        const line=option==='linear';
        const x=left+(line ? .18 : .73);
        const y=bottom-.38;
        item('sink',next,x+.45,y,.90,.60,2);
        item('cabinet',next,x+1.20,y,.60,.60,2);
        item('stove',next,x+1.80,y,.60,.60,2);
        item('wallCabinet',next,x+.75,bottom-.26,1.50,.35,2,false);
        item('fridge',next,line ? x+2.445 : left+.46,line ? y : top+.43,.65,.65,line ? 2 : 0);
        if (!line) item('cabinet',next,left+.38,bottom-1.06,.70,.60,1);
        item('table',next,left+1.58,top+1.26,1,.65);
      }
    }
    const bedroom=swap ? null : room('Quarto',bedroomLeft.a.x,bedroomRight.a.x,bedroomTop.a.y,bedroomEnd.a.y,'grayTile','slats');
    if (bedroom && bedroom.right-bedroom.left>=2.75 && bedroom.bottom-bedroom.top>=2.85) {
      const {left,right,top,bottom}=bedroom;
      item('bed',bedroom,left+.84,top+1.08,1.38,1.90);
      item('nightstand',bedroom,left+1.88,top+.39,.38,.39,2);
      item('dresser',bedroom,right-.34,top+.68,.91,.46,3);
      item('wardrobe',bedroom,right-.91,bottom-.36,1.45,.55);
      item('desk',bedroom,left+.61,bottom-.36,.87,.46);
      item('chair',bedroom,left+.63,bottom-.75,.38,.38,2,false);
    }
  }
  const storageLeft=vertical('left-middle');
  const storageRight=vertical('lower-divider');
  const storageEnd=horizontal('left-base');
  if (storageLeft && storageRight && bedroomEnd && storageEnd) {
    const storage=room('Depósito',storageLeft.a.x,storageRight.a.x,bedroomEnd.a.y,storageEnd.a.y,'parquet','panels');
    if (storage && storage.right-storage.left>=2.85 && storage.bottom-storage.top>=1.55) {
      const {left,right,top,bottom}=storage;
      item('wardrobeWhite',storage,left+1.30,bottom-.31,1.32,.45);
      item('shelves',storage,left+1.35,top+.20,1.73,.25,2,false);
      item('sewing',storage,right-.39,top+.46,.66,.43,3);
    }
  }

  const bathSide=vertical('strip-side');
  const bathEnd=horizontal('rear-entry');
  const bathOutside=vertical('right-strip');
  if (bathSide && bathOutside && kitchenBottom && bathEnd) {
    const bath=room('Banheiro',bathSide.a.x,bathOutside.a.x,kitchenBottom.a.y,bathEnd.a.y,'bathPattern','slats',false);
    if (bath && bath.right-bath.left>=1.8 && bath.bottom-bath.top>=1.25) {
      const {left,right,top}=bath;
      const toiletX=right-.75;
      item('toilet',bath,toiletX,top+.35,.38,.55);
      item('bathSink',bath,left+.60,top+.29,.47,.38);
      item('cistern',bath,toiletX,top+.145,.36,.14,0,false);
    }
  }
  const rearBathSide=vertical('annex-upper');
  const rearBathOutside=vertical('right-annex');
  const rearBathBack=horizontal('annex-top');
  if (rearBathSide && rearBathOutside && rearBathBack && kitchenTop) {
    const bath=room('Banheiro dos fundos',rearBathSide.a.x,rearBathOutside.a.x,rearBathBack.a.y,kitchenTop.a.y,'bathClay','panels',false);
    if (bath && bath.right-bath.left>=1.18 && bath.bottom-bath.top>=1.33) {
      const {right,top,bottom}=bath;
      item('toilet',bath,right-.35,Math.min(bottom-.64,top+1.16),.36,.53,3);
      item('bathSink',bath,right-.30,top+.45,.40,.36,3);
    }
  }

  const livingLeft=vertical('left-lower');
  const livingTop=horizontal('left-base');
  const livingEnd=horizontal('bottom-left');
  if (livingLeft && livingTop && livingEnd) {
    room('Sala',livingLeft.a.x,livingEnd.b.x,livingTop.a.y,livingEnd.a.y,'neutral','slats',false);
  }
  return {rooms,items:[...items,...customFurniture(project)]};
}
