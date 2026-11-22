import { clamp, interval, pointAt } from './geometry.mjs';

const sofaWidth=1.80;
const sofaDepth=.85;
const diagonal=50*.0254;
const tvWidth=diagonal*16/Math.hypot(16,9);
const tvHeight=diagonal*9/Math.hypot(16,9);

export function livingRoomFurniture(project) {
  const windowWall=project.walls.find(wall=>wall.id==='bottom-left');
  const tvWall=project.walls.find(wall=>wall.id==='left-base');
  const sideWall=project.walls.find(wall=>wall.id==='left-lower');
  const windowOpening=project.openings.find(opening=>opening.id==='window-0' &&
    opening.wallId===windowWall?.id && opening.type==='window');
  if (!windowOpening || !tvWall || !sideWall || windowWall.a.y!==windowWall.b.y ||
      tvWall.a.y!==tvWall.b.y || sideWall.a.x!==sideWall.b.x || tvWall.a.y>=windowWall.a.y) return null;

  const left=Math.max(windowWall.a.x,tvWall.a.x)+sideWall.thickness/2;
  const right=Math.min(windowWall.b.x,tvWall.b.x)-.10;
  const frontWallY=windowWall.a.y-windowWall.thickness/2;
  const tvFace=tvWall.a.y+tvWall.thickness/2;
  if (frontWallY-tvFace<1.8) return null;
  const bounds={min:left+.10,max:right-.10};
  const doors=project.openings.filter(opening=>opening.wallId===sideWall.id && opening.type==='door');
  for (const door of doors) {
    const [start,end]=interval(door,sideWall);
    const first=sideWall.a.y+start;
    const last=sideWall.a.y+end;
    if (last>=frontWallY-sofaDepth-.34 && first<=frontWallY) {
      bounds.min=Math.max(bounds.min,left+door.width+.10);
    }
  }
  const width=Math.min(sofaWidth,bounds.max-bounds.min);
  if (width<1.20) return null;
  const x=clamp(pointAt(windowWall,windowOpening.t).x,bounds.min+width/2,bounds.max-width/2);
  const sofa={x,y:frontWallY-.06-sofaDepth/2,width,depth:sofaDepth};
  const tv={x,y:tvFace+.05,width:tvWidth,height:tvHeight,elevation:1.21};
  return {sofa,tv};
}
