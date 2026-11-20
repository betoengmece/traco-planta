import { defaultWallThickness, length } from './geometry.mjs';

// Coordinates are in metres, relative to the upper-left corner of the source plan.
const leftRoom = 2.9733;
const rearRoom = 2.9867;
const passage = 3.9733;
const annex = 5.9733;
const right = 7.9733;
const topLeft = .0149;
const entry = .9511;
const annexBottom = 1.4233;
const leftPartition = 3.2149;
const stripTop = 5.2633;
const leftRoomBottom = 5.7149;
const stripBottom = 6.5633;
const rearBottom = 9.5633;
const leftBottom = 9.9633;

export const houseOutline = [
  [0,topLeft],[leftRoom,topLeft],[leftRoom,entry],[annex,entry],[annex,0],[right,0],
  [right,rearBottom],[rearRoom,rearBottom],[rearRoom,leftBottom],[0,leftBottom]
];

const segments = [
  ['top-left',0,topLeft,leftRoom,topLeft],
  ['left-upper',0,topLeft,0,leftPartition],
  ['left-middle',0,leftPartition,0,leftRoomBottom],
  ['left-lower',0,leftRoomBottom,0,leftBottom],
  ['bottom-left',0,leftBottom,rearRoom,leftBottom],
  ['upper-divider',leftRoom,topLeft,leftRoom,entry],
  ['middle-divider',leftRoom,entry,leftRoom,leftPartition],
  ['lower-divider',leftRoom,leftPartition,leftRoom,leftRoomBottom],
  ['left-cross',0,leftPartition,leftRoom,leftPartition],
  ['left-base',0,leftRoomBottom,leftRoom,leftRoomBottom],
  ['entry',leftRoom,entry,annex,entry],
  ['annex-upper',annex,0,annex,entry],
  ['annex-lower',annex,entry,annex,annexBottom],
  ['annex-top',annex,0,right,0],
  ['annex-bottom',annex,annexBottom,right,annexBottom],
  ['right-annex',right,0,right,annexBottom],
  ['right-main',right,annexBottom,right,stripTop],
  ['right-strip',right,stripTop,right,stripBottom],
  ['right-rear',right,stripBottom,right,rearBottom],
  ['strip-top',passage,stripTop,right,stripTop],
  ['strip-side',passage,stripTop,passage,stripBottom],
  ['rear-entry',rearRoom,stripBottom,right,stripBottom],
  ['rear-side',rearRoom,stripBottom,rearRoom,rearBottom],
  ['bottom-right',rearRoom,rearBottom,right,rearBottom],
  ['bottom-step',rearRoom,rearBottom,rearRoom,leftBottom]
];

const doors = [
  ['middle-divider',2.3642,'start',1],
  ['lower-divider',4.9508,'end',1],
  ['strip-side',5.9775,'end',-1],
  ['rear-entry',3.6042,'start',1],
  ['left-lower',9.3242,'end',-1],
  ['annex-bottom',7.1975,'end',-1],
  ['entry',3.5864,'start',1]
];

const slidingWindows = [
  ['bottom-left',1.5800],['bottom-right',5.5667],['right-main',3.4733],
  ['left-middle',4.4733],['left-upper',1.6467],['top-left',1.5667]
];

export function defaultProject() {
  const walls = segments.map(([id,x,y,endX,endY]) => ({
    id, a:{x,y}, b:{x:endX,y:endY}, height:2.5, thickness:defaultWallThickness
  }));
  const byId = new Map(walls.map(wall => [wall.id,wall]));
  function opening(id, wallId, center, details) {
    const wall = byId.get(wallId);
    const start = wall.a.x === wall.b.x ? wall.a.y : wall.a.x;
    return { id, wallId, t:(center-start)/length(wall), ...details };
  }
  const openings = [
    ...doors.map(([wall,center,hinge,side],index) =>
      opening('door-'+index,wall,center,{type:'door',width:.915,height:2.085,sill:0,hinge,side})),
    ...slidingWindows.map(([wall,center],index) =>
      opening('window-'+index,wall,center,{type:'window',width:1.32,height:2.1,sill:.11})),
    opening('casement','entry',4.9227,{type:'window',width:1.152,height:1.34,sill:.87,casement:true,side:-1})
  ];
  return {name:'Planta da casa',walls,openings,template:'house',wallThickness:defaultWallThickness};
}
