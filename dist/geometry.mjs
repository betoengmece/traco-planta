export const length = wall => Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
export const pointAt = (wall, t) => ({
  x: wall.a.x + (wall.b.x - wall.a.x) * t,
  y: wall.a.y + (wall.b.y - wall.a.y) * t
});
export const heading = wall => Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (x, min, max) => Math.max(min, Math.min(x, max));
export const interval = (opening, wall) => [opening.t * length(wall) - opening.width / 2, opening.t * length(wall) + opening.width / 2];

export function projectToWall(point, wall) {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const t = clamp(((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { wall, t, distance: distance(point, pointAt(wall, t)) };
}

export function nearestWall(point, walls, limit) {
  return walls.map(wall => projectToWall(point, wall))
    .filter(hit => hit.distance <= limit)
    .sort((a, b) => a.distance - b.distance)[0];
}

export function validateOpening(opening, wall, siblings) {
  if (!wall || opening.width < .2 || opening.height < .2 || opening.sill < 0) return false;
  const [start, end] = interval(opening, wall);
  return start >= .049999 && end <= length(wall) - .049999 &&
    opening.sill + opening.height <= wall.height + .000001 &&
    !siblings.some(other => {
      if (other.id === opening.id || other.wallId !== wall.id) return false;
      const [left, right] = interval(other, wall);
      return start < right + .02 && end > left - .02;
    });
}

export function joinedWallCaps(wall,walls) {
  const angle=heading(wall);
  function cap(edge,inside) {
    let extension=0;
    for (const other of walls) {
      if (other.id===wall.id) continue;
      const intersection=projectToWall(wall[edge],other);
      if (intersection.distance>.00001) continue;
      const sine=Math.abs(Math.sin(heading(other)-angle));
      if (sine<.00001) {
        const outgoingX=wall[edge].x-wall[inside].x;
        const outgoingY=wall[edge].y-wall[inside].y;
        if ([other.a,other.b].some(point =>
          (point.x-wall[edge].x)*outgoingX+(point.y-wall[edge].y)*outgoingY>.00001)) return 0;
      } else {
        extension=Math.max(extension,other.thickness/(2*Math.max(.5,sine)));
      }
    }
    return extension;
  }
  return {a:cap('a','b'),b:cap('b','a')};
}

export function placeOpening(project,opening,position,{scale,magnetism}) {
  const hit = nearestWall(position,project.walls,13/scale);
  if (!hit) return null;
  const wallLength = length(hit.wall);
  const margin = (opening.width/2 + .05)/wallLength;
  if (margin > .5) return null;

  const distanceFromStart = magnetism ? Math.round(hit.t*wallLength*10)/10 : hit.t*wallLength;
  const next = { ...opening, wallId:hit.wall.id, t:clamp(distanceFromStart/wallLength,margin,1-margin) };
  const previous = project.walls.find(wall => wall.id===opening.wallId);
  if (previous && Math.cos(heading(previous)-heading(hit.wall)) < -.5) {
    next.hinge=opening.hinge==='end' ? 'start' : 'end';
    next.side=-opening.side;
  }
  return validateOpening(next,hit.wall,project.openings) ? next : null;
}

export function bounds(project) {
  if (!project.walls.length) return { x: 0, y: 0, width: 6, depth: 5 };
  const points = project.walls.flatMap(wall => [wall.a, wall.b]);
  const x = Math.min(...points.map(point => point.x));
  const y = Math.min(...points.map(point => point.y));
  return {
    x, y,
    width: Math.max(1, Math.max(...points.map(point => point.x)) - x),
    depth: Math.max(1, Math.max(...points.map(point => point.y)) - y)
  };
}

const coords = [
  [-5,-3.5,-.25,-3.5],[-.25,-3.5,5,-3.5],[5,-3.5,5,0],[5,0,5,2.45],
  [5,2.45,2.1,2.45],[2.1,2.45,2.1,3.6],[2.1,3.6,-1.35,3.6],[-1.35,3.6,-5,3.6],
  [-5,3.6,-5,1],[-5,1,-5,-3.5],[-.25,-3.5,-.25,0],[-.25,0,2.1,0],
  [2.1,0,5,0],[2.1,0,2.1,2.45],[-5,1,-1.35,1],[-1.35,1,-1.35,3.6]
];

export function legacyExampleProject() {
  const walls = coords.map(([x, y, endX, endY], i) => ({
    id: 'w' + i, a: {x, y}, b: {x: endX, y: endY}, height: 2.7, thickness: i < 10 ? .2 : .14
  }));
  const openings = [
    [0,'window',.43,2.05,1.08,.95],[1,'window',.57,2.25,1.08,.95],
    [3,'window',.53,.8,.66,1.42],[7,'window',.49,1.6,1.08,.95],
    [9,'window',.58,1.35,1.08,.95],[6,'door',.46,.95,2.1,0],
    [11,'door',.56,.86,2.1,0],[13,'door',.56,.76,2.1,0],[15,'door',.51,.83,2.1,0]
  ].map(([wall, type, t, width, height, sill], i) => ({
    id: 'o' + i, wallId: 'w' + wall, type, t, width, height, sill,
    hinge: i % 2 ? 'end' : 'start', side: [6,7].includes(i) ? -1 : 1
  }));
  return { name: 'Casa exemplo', walls, openings, example: true };
}
