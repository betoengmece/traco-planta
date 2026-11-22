import { clamp, interval, joinedWallCaps, length } from './geometry.mjs';

export const eyeHeight=1.60;
const bodyRadius=.18;
const maxStep=bodyRadius/2;

// The collision rectangles use the same wall thickness and end caps as the 3D model.
export function walkBarriers(project) {
  const doorsByWall=new Map();
  for (const door of project.openings) {
    if (door.type!=='door' || door.sill>.06 || door.sill+door.height<eyeHeight+.08) continue;
    if (!doorsByWall.has(door.wallId)) doorsByWall.set(door.wallId,[]);
    doorsByWall.get(door.wallId).push(door);
  }

  return project.walls.flatMap(wall => {
    const span=length(wall);
    if (span<.001) return [];
    const caps=joinedWallCaps(wall,project.walls);
    const ux=(wall.b.x-wall.a.x)/span;
    const uy=(wall.b.y-wall.a.y)/span;
    const half=wall.thickness/2;
    const barriers=[];
    const add=(start,end) => {
      if (end>start) barriers.push({x:wall.a.x,y:wall.a.y,ux,uy,half,start,end});
    };
    const openings=(doorsByWall.get(wall.id) ?? []).map(door => {
      const [start,end]=interval(door,wall);
      const jamb=Math.min(.034,door.width*.07);
      return [start+jamb,end-jamb];
    }).sort((a,b)=>a[0]-b[0]);

    let cursor=-caps.a;
    for (const [start,end] of openings) {
      add(cursor,clamp(start,-caps.a,span+caps.b));
      cursor=Math.max(cursor,Math.min(end,span+caps.b));
    }
    add(cursor,span+caps.b);
    return barriers;
  });
}

export function canStand(x,y,barriers) {
  return !barriers.some(wall => {
    const dx=x-wall.x, dy=y-wall.y;
    const along=dx*wall.ux+dy*wall.uy;
    const across=-dx*wall.uy+dy*wall.ux;
    return Math.hypot(along-clamp(along,wall.start,wall.end),across-clamp(across,-wall.half,wall.half))<bodyRadius;
  });
}

export function walkStep(position,dx,dy,barriers,box) {
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/maxStep));
  let {x,y}=position;
  for (let step=0;step<count;step++) {
    const nextX=clamp(x+dx/count,box.x-2,box.x+box.width+2);
    const nextY=clamp(y+dy/count,box.y-2,box.y+box.depth+2);
    if (canStand(nextX,nextY,barriers)) {
      x=nextX;
      y=nextY;
    } else {
      if (canStand(nextX,y,barriers)) x=nextX;
      if (canStand(x,nextY,barriers)) y=nextY;
    }
  }
  return {x,y};
}

export function walkSpawn(box,barriers) {
  const center={x:box.x+box.width/2,y:box.y+box.depth/2};
  if (canStand(center.x,center.y,barriers)) return center;
  let nearest=null;
  let distance=Infinity;
  for (let row=0;row<13;row++) {
    for (let column=0;column<13;column++) {
      const x=box.x+box.width*(column+.5)/13;
      const y=box.y+box.depth*(row+.5)/13;
      const gap=Math.hypot(x-center.x,y-center.y);
      if (gap<distance && canStand(x,y,barriers)) {
        nearest={x,y};
        distance=gap;
      }
    }
  }
  return nearest ?? {x:box.x-.5,y:center.y};
}
