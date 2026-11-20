import { distance, heading, length, nearestWall, pointAt, validateOpening } from './geometry.mjs';

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

export function snapWallPoint(raw,start,walls,{scale,magnetism,orthogonal}) {
  const radius = 9 / scale;
  const points = magnetism ? endpoints(walls) : [];
  if (!start) {
    if (!magnetism) return raw;
    const endpoint = closestPoint(raw,points,radius);
    const hit = nearestWall(raw,walls,radius*.7);
    return endpoint ?? (hit ? pointAt(hit.wall,hit.t) : {x:roundLength(raw.x),y:roundLength(raw.y)});
  }
  if (!magnetism && !orthogonal) return raw;

  const vector = subtract(raw,start);
  const rawLength = Math.hypot(vector.x,vector.y);
  if (rawLength < epsilon) return start;
  const adjacent = nearestWall(start,walls,epsilon)?.wall;
  const angle = adjacent ? heading(adjacent) : 0;
  const axes = [0, Math.PI/2, angle, angle+Math.PI/2]
    .map(radians => ({x:Math.cos(radians),y:Math.sin(radians)}))
    .sort((a,b) => Math.abs(cross(a,vector))-Math.abs(cross(b,vector)));
  const axis = axes[0];
  const align = orthogonal || Math.abs(cross(axis,vector)) / rawLength <= Math.sin(Math.PI/10);
  const compatible = align && orthogonal ? points.filter(point => Math.abs(cross(axis,subtract(point,start))) < epsilon) : points;
  const nearest = closestPoint(raw,compatible,radius);
  if (nearest && distance(start,nearest) >= minimumWallLength) return nearest;

  const direction = align ? axis : {x:vector.x/rawLength,y:vector.y/rawLength};
  const signedLength = dot(vector,direction);
  return along(start,direction,magnetism ? roundLength(signedLength) : signedLength);
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
    const offset = cross(relative,axis) / divider;
    if (offset >= -epsilon && offset <= 1+epsilon) check(cross(relative,segment)/divider);
  }
  return along(fixed,axis,Math.max(minimumWallLength,target ?? roundLength(projected)));
}

export function moveWallEndpoint(project,wall,edge,point) {
  const original = wall[edge];
  if (distance(original,point) < epsilon) return null;
  const moved = new Map();
  const walls = project.walls.map(candidate => {
    const endpoint = candidate.id === wall.id ? edge :
      ['a','b'].find(key => distance(candidate[key],original) < epsilon);
    if (!endpoint) return candidate;
    const updated = { ...candidate, [endpoint]:point };
    moved.set(candidate.id,{previous:candidate,updated,endpoint});
    return updated;
  });
  if ([...moved.values()].some(({updated}) => length(updated) < minimumWallLength-epsilon)) return false;

  const openings = project.openings.map(opening => {
    const change = moved.get(opening.wallId);
    if (!change) return opening;
    const {previous,updated,endpoint} = change;
    const fromFixed = (endpoint==='b' ? opening.t : 1-opening.t)*length(previous);
    const fraction = fromFixed/length(updated);
    return { ...opening, t:endpoint==='b' ? fraction : 1-fraction };
  });
  const blocked = openings.some(opening => {
    const change = moved.get(opening.wallId);
    return change && !validateOpening(opening,change.updated,openings);
  });
  return blocked ? false : { walls, openings };
}
