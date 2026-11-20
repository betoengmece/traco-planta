import { distance, heading, joinedWallCaps, pointAt, projectToWall } from './geometry.mjs';

const epsilon=.00001;

export function wallFaces(walls) {
  return walls.flatMap(wall => {
    const angle=heading(wall);
    const x=Math.cos(angle);
    const y=Math.sin(angle);
    const half=wall.thickness/2;
    const caps=joinedWallCaps(wall,walls);
    const start={x:wall.a.x-x*caps.a,y:wall.a.y-y*caps.a};
    const end={x:wall.b.x+x*caps.b,y:wall.b.y+y*caps.b};
    const offset=(point,side)=>({x:point.x-y*half*side,y:point.y+x*half*side});
    const corners=[offset(start,1),offset(end,1),offset(end,-1),offset(start,-1)];
    return corners.map((a,index)=>({a,b:corners[(index+1)%corners.length]}));
  });
}

function onAxis(face,target,coordinate) {
  const start=face.a[coordinate];
  const span=face.b[coordinate]-start;
  if (Math.abs(span)<epsilon) {
    if (Math.abs(target[coordinate]-start)>epsilon) return null;
    return pointAt(face,projectToWall(target,face).t);
  }
  const t=(target[coordinate]-start)/span;
  return t>=0 && t<=1 ? pointAt(face,t) : null;
}

export function measurePoint(raw,origin,faces,{scale,magnetism,orthogonal}) {
  const dx=origin ? Math.abs(raw.x-origin.x) : 0;
  const dy=origin ? Math.abs(raw.y-origin.y) : 0;
  const align=origin && (orthogonal || (magnetism &&
    Math.min(dx,dy)<=Math.max(dx,dy)*Math.tan(Math.PI/12)));
  const coordinate=dx>=dy ? 'y' : 'x';
  const target=align ? { ...raw,[coordinate]:origin[coordinate] } : raw;
  if (!magnetism) return target;

  let closest=null;
  let radius=9/scale;
  for (const face of faces) {
    const point=align ? onAxis(face,target,coordinate) : pointAt(face,projectToWall(target,face).t);
    if (!point) continue;
    const gap=distance(point,target);
    if (gap<radius) {
      closest=point;
      radius=gap;
    }
  }
  return closest ?? target;
}
