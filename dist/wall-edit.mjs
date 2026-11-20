import { distance, heading, length, nearestWall, pointAt, projectToWall, validateOpening } from './geometry.mjs';

const gridStep = .1;
export const minimumWallLength = .15;
const epsilon = .00001;
const roundLength = value => Math.round(value / gridStep) / 10;
const dot = (a,b) => a.x*b.x + a.y*b.y;
const cross = (a,b) => a.x*b.y - a.y*b.x;
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
const along = (origin,axis,d) => ({x:origin.x+axis.x*d,y:origin.y+axis.y*d});
const endpoints = walls => walls.flatMap(wall => [wall.a,wall.b]);

function closestPoint(target,points,radius) {
  return points.reduce((closest,point) =>
    distance(target,point) <= (closest ? distance(target,closest) : radius) ? point : closest,null);
}

function wallIntersection(origin,axis,wall) {
  const segment=subtract(wall.b,wall.a);
  const relative=subtract(wall.a,origin);
  const divider=cross(axis,segment);
  if (Math.abs(divider)<epsilon) return null;
  const offset=cross(relative,axis)/divider;
  return offset>=-epsilon && offset<=1+epsilon ? cross(relative,segment)/divider : null;
}

export function snapWallPoint(raw,start,walls,{scale,magnetism,orthogonal,fixedLength=null}) {
  const radius=9/scale;
  const points=magnetism ? endpoints(walls) : [];
  if (!start) {
    if (!magnetism) return raw;
    const endpoint=closestPoint(raw,points,radius);
    if (endpoint) return endpoint;
    const hit=walls.map(wall=>projectToWall(raw,wall))
      .filter(({wall,distance:gap})=>gap<=Math.max(radius*.7,wall.thickness/2+4/scale))
      .sort((a,b)=>a.distance-b.distance)[0];
    return hit ? pointAt(hit.wall,hit.t) : {x:roundLength(raw.x),y:roundLength(raw.y)};
  }
  if (!magnetism && !orthogonal && fixedLength===null) return raw;

  const vector=subtract(raw,start);
  const rawLength=Math.hypot(vector.x,vector.y);
  if (rawLength<epsilon) return start;
  const adjacent=nearestWall(start,walls,epsilon)?.wall;
  const angle=adjacent ? heading(adjacent) : 0;
  const directions=[0,Math.PI/2];
  if (Math.abs(Math.sin(2*angle))>Math.sin(Math.PI/30)) directions.push(angle,angle+Math.PI/2);
  const axes=directions.map(radians=>({x:Math.cos(radians),y:Math.sin(radians)}))
    .sort((a,b)=>Math.abs(cross(a,vector))-Math.abs(cross(b,vector)));
  const axis=axes[0];
  const align=orthogonal || (magnetism && Math.abs(cross(axis,vector))/rawLength<=Math.sin(Math.PI/10));
  const compatible=points.filter(point=>{
    const offset=subtract(point,start);
    const gap=Math.hypot(offset.x,offset.y);
    return gap>=minimumWallLength && (!align || Math.abs(cross(axis,offset))<epsilon) &&
      (fixedLength===null || Math.abs(gap-fixedLength)<epsilon);
  });
  const nearest=closestPoint(raw,compatible,radius);
  if (nearest) return nearest;

  const direction=align ? axis : {x:vector.x/rawLength,y:vector.y/rawLength};
  const signedLength=dot(vector,direction);
  if (magnetism && fixedLength===null) {
    const intersections=walls.map(wall=>wallIntersection(start,direction,wall))
      .filter(value=>value!==null && Math.abs(value)>=minimumWallLength && Math.sign(value)===Math.sign(signedLength))
      .map(value=>along(start,direction,value));
    const crossing=closestPoint(raw,intersections,radius);
    if (crossing) return crossing;
  }
  const chosenLength=fixedLength===null
    ? (magnetism ? roundLength(signedLength) : signedLength)
    : Math.sign(signedLength)*fixedLength;
  return along(start,direction,chosenLength);
}

export function straightenedEnd(wall) {
  const dx=wall.b.x-wall.a.x;
  const dy=wall.b.y-wall.a.y;
  if (Math.abs(dx)<epsilon || Math.abs(dy)<epsilon) return null;
  return Math.abs(dx)>=Math.abs(dy) ? {x:wall.b.x,y:wall.a.y} : {x:wall.a.x,y:wall.b.y};
}

export function stretchPoint(wall,edge,raw,walls,{scale,magnetism}) {
  const fixed = wall[edge==='a' ? 'b' : 'a'];
  const original = subtract(wall[edge],fixed);
  const size = length(wall);
  const axis = {x:original.x/size,y:original.y/size};
  const projected = dot(subtract(raw,fixed),axis);
  if (!magnetism) return along(fixed,axis,Math.max(minimumWallLength,projected));

  // Snap only to points on the wall's own axis so its angle stays fixed.
  let target = null;
  let threshold = 9 / scale;
  function check(candidate) {
    const gap = Math.abs(candidate-projected);
    if (candidate >= minimumWallLength && gap <= threshold) {
      target = candidate;
      threshold = gap;
    }
  }
  for (const other of walls) {
    if (other.id === wall.id) continue;
    const segment = subtract(other.b,other.a);
    const relative = subtract(other.a,fixed);
    const divider = cross(axis,segment);
    if (Math.abs(divider) < epsilon) {
      if (Math.abs(cross(axis,relative)) < epsilon) {
        check(dot(relative,axis));
        check(dot(subtract(other.b,fixed),axis));
      }
      continue;
    }
    const crossing=wallIntersection(fixed,axis,other);
    if (crossing!==null) check(crossing);
  }
  return along(fixed,axis,Math.max(minimumWallLength,target ?? roundLength(projected)));
}

function fitWallOpenings(openings,wall,edge) {
  const size=length(wall);
  const distanceFromFixed=item=>(edge==='b' ? item.t : 1-item.t)*size;
  const ordered=[...openings].sort((a,b)=>distanceFromFixed(a)-distanceFromFixed(b));
  const clearance=.05;
  const gap=.020001;
  let remaining=size-clearance;
  const ends=new Map();
  for (const item of [...ordered].reverse()) {
    ends.set(item.id,remaining-item.width/2);
    remaining-=item.width+gap;
  }
  let start=clearance;
  const adjusted=new Map();
  for (const item of ordered) {
    const first=start+item.width/2;
    const last=ends.get(item.id);
    if (first>last+epsilon) return null;
    const center=Math.max(first,Math.min(distanceFromFixed(item),last));
    adjusted.set(item.id,{ ...item,t:edge==='b' ? center/size : 1-center/size });
    start=center+item.width/2+gap;
  }
  return adjusted;
}

function finishWallMove(project,walls,changes,slideOpenings=false) {
  if ([...changes.values()].some(({updated}) => length(updated)<minimumWallLength-epsilon)) return false;
  let openings=project.openings.map(opening => {
    const change=changes.get(opening.wallId);
    if (!change || change.edges.length===2) return opening;
    const {previous,updated,edges:[edge]}=change;
    const fromFixed=(edge==='b' ? opening.t : 1-opening.t)*length(previous);
    const fraction=fromFixed/length(updated);
    return { ...opening, t:edge==='b' ? fraction : 1-fraction };
  });
  if (slideOpenings) {
    const adjusted=new Map();
    for (const {previous,updated,edges} of changes.values()) {
      if (edges.length!==1 || length(updated)>=length(previous)-epsilon) continue;
      const attached=openings.filter(opening=>opening.wallId===updated.id);
      const fit=fitWallOpenings(attached,updated,edges[0]);
      if (!fit) return false;
      for (const [id,item] of fit) adjusted.set(id,item);
    }
    openings=openings.map(item=>adjusted.get(item.id) ?? item);
  }
  const blocked=openings.some(opening => {
    const change=changes.get(opening.wallId);
    return change && !validateOpening(opening,change.updated,openings);
  });
  return blocked ? false : { walls, openings };
}

export function moveWallEndpoint(project,wall,edge,point) {
  const original=wall[edge];
  if (distance(original,point)<epsilon) return null;
  const changes=new Map();
  const walls=project.walls.map(candidate => {
    const endpoint=candidate.id===wall.id ? edge : ['a','b'].find(key=>distance(candidate[key],original)<epsilon);
    if (!endpoint) return candidate;
    const updated={ ...candidate, [endpoint]:point };
    changes.set(candidate.id,{previous:candidate,updated,edges:[endpoint]});
    return updated;
  });
  return finishWallMove(project,walls,changes);
}

export function wallDragDelta(vector,magnetism) {
  if (!magnetism) return vector;
  const x=Math.abs(vector.x);
  const y=Math.abs(vector.y);
  const slope=Math.tan(Math.PI/10);
  return {
    x:x<y*slope ? 0 : roundLength(vector.x),
    y:y<x*slope ? 0 : roundLength(vector.y)
  };
}

export function moveWallGroup(project,ids,delta) {
  if (!ids.size || Math.hypot(delta.x,delta.y)<epsilon) return null;
  const group=project.walls.filter(wall=>ids.has(wall.id));
  if (!group.length) return null;
  const changes=new Map();
  const walls=project.walls.map(wall => {
    const edges=['a','b'].filter(edge => ids.has(wall.id) ||
      group.some(target=>projectToWall(wall[edge],target).distance<epsilon));
    if (!edges.length) return wall;
    const updated={ ...wall };
    for (const edge of edges) {
      updated[edge]={x:wall[edge].x+delta.x,y:wall[edge].y+delta.y};
    }
    changes.set(wall.id,{previous:wall,updated,edges});
    return updated;
  });

  if ([...changes.values()].some(({previous,updated}) =>
    dot(subtract(previous.b,previous.a),subtract(updated.b,updated.a))<=epsilon)) return false;

  const byId=new Map(walls.map(wall=>[wall.id,wall]));
  for (const wall of project.walls) {
    const updated=byId.get(wall.id);
    for (const other of project.walls) {
      if (other.id===wall.id || (!changes.has(wall.id) && !changes.has(other.id))) continue;
      const next=byId.get(other.id);
      if (['a','b'].some(edge => projectToWall(wall[edge],other).distance<epsilon &&
        projectToWall(updated[edge],next).distance>=epsilon)) return false;
    }
  }
  return finishWallMove(project,walls,changes,true);
}
