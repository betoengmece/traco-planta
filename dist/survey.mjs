import { clamp, defaultWallThickness, interval, length, validateOpening } from './geometry.mjs';
import { defaultProject, houseLayout } from './template.mjs';

const tape = 7;
const thickness = defaultWallThickness;
const half = thickness / 2;
const metres = cm => cm / 100;

const field = {
  upperLeftWidth:328, upperLeftDepth:333,
  middleLeftWidth:326, middleLeftDepth:195, doorA:61.5+tape, doorAHeight:211, doorB:57.5,
  annexWidth:130+tape, annexDepth:183+tape, annexSide:48, annexBottom:103,
  upperRightWidth:229, upperRightDepth:312,
  stripWidth:230, stripDepth:143, stripSide:162,
  lowerLeftWidth:318+tape, lowerLeftDepth:407+tape,
  lowerRightWidth:315+tape, lowerRightDepth:345+tape, rearDoor:72+tape,
  lowerLeftDoorWidth:72+tape, lowerLeftDoorOffset:35+tape
};

const leftRoom = metres(field.upperLeftWidth) + thickness;
const rearRoom = metres(field.lowerLeftWidth) + thickness;
const right = rearRoom + metres(field.lowerRightWidth) + thickness;
const annex = right - metres(field.annexWidth) - thickness;
const annexBottom = metres(field.annexDepth) + thickness;
const entry = annexBottom - metres(field.annexSide);
const leftPartition = metres(field.upperLeftDepth) + thickness;
const leftRoomBottom = leftPartition + metres(field.middleLeftDepth) + thickness;
const leftBottom = leftRoomBottom + metres(field.lowerLeftDepth) + thickness;
const stripTop = annexBottom + metres(field.upperRightDepth) + thickness;
const stripBottom = stripTop + metres(field.stripDepth) + thickness;
const passage = right - metres(field.stripWidth) - thickness;
const rearBottom = stripBottom + metres(field.lowerRightDepth) + thickness;

const layout = {
  leftRoom, rearRoom, passage, annex, right, topLeft:0, entry, annexBottom,
  leftPartition, stripTop, leftRoomBottom, stripBottom, rearBottom, leftBottom
};

const {outline:surveyOutline,walls} = houseLayout(layout);
export { surveyOutline };

const middleDividerHalf=half+metres(field.upperLeftWidth-field.middleLeftWidth);

function surveyedOpenings() {
  const {openings:standardOpenings}=defaultProject();
  const byId=new Map(walls.map(wall => [wall.id,wall]));
  // The middle compartment is 2 cm narrower on the sketch. Keep the divider aligned.
  byId.get('lower-divider').thickness=middleDividerHalf*2;
  return standardOpenings.map(opening => {
    const span=length(byId.get(opening.wallId));
    const result={...opening};
    if (opening.wallId==='lower-divider') {
      result.width=metres(field.doorA);
      result.height=metres(field.doorAHeight);
    }
    if (opening.wallId==='rear-entry') result.width=metres(field.rearDoor);
    if (opening.wallId==='entry') {
      const door=opening.type==='door';
      // Preserve the previous relative placement in the narrower span.
      result.width *= span/3;
      result.t=door ? .25 : .70;
    }
    const clearance=(result.width/2 + .05)/span;
    result.t=clamp(result.t,clearance,1-clearance);
    return result;
  });
}
const previousOpenings=surveyedOpenings();
const previousLowerLeftDoor=previousOpenings.find(opening => opening.wallId==='left-lower');

function lowerLeftDoorPlacement(door,wall,bottomWall) {
  const width=metres(field.lowerLeftDoorWidth);
  const distanceFromEnd=bottomWall.thickness/2+metres(field.lowerLeftDoorOffset);
  return {...door,width,t:1-(distanceFromEnd+width/2)/length(wall)};
}

function correctSurveyCopy(project) {
  if (project?.template!=='survey') return project;
  const door=project.openings.find(opening => opening.id===previousLowerLeftDoor.id);
  // Only reposition the previous preset's door if its location and width are still intact.
  if (door?.wallId!==previousLowerLeftDoor.wallId || door.t!==previousLowerLeftDoor.t ||
      door.width!==previousLowerLeftDoor.width) return project;
  const wall=project.walls.find(item => item.id===door.wallId);
  const bottomWall=project.walls.find(item => item.id==='bottom-left');
  if (!wall || !bottomWall) return project;
  const corrected=lowerLeftDoorPlacement(door,wall,bottomWall);
  if (!validateOpening(corrected,wall,project.openings)) return project;
  return {...project,openings:project.openings.map(opening => opening===door ? corrected : opening)};
}

export function withSurveyDoorCorrection(project) {
  const corrected=correctSurveyCopy(project);
  const original=correctSurveyCopy(project.original);
  return original===project.original ? corrected : {...corrected,original};
}

const openings=correctSurveyCopy({template:'survey',walls,openings:previousOpenings}).openings;

export function surveyProject() {
  const original=structuredClone({name:'Levantamento da casa',walls,openings,template:'survey',wallThickness:thickness});
  return {...structuredClone(original),original};
}

export const surveyDoors = { aWidth:field.doorA, aHeight:field.doorAHeight, bWidth:field.doorB };

const h = (cm, x1, x2, y, options) => ({cm,a:{x:x1,y},b:{x:x2,y},...options});
const v = (cm, x, y1, y2, options) => ({cm,a:{x,y:y1},b:{x,y:y2},...options});
const doorBounds = wallId => {
  const wall=walls.find(item => item.id===wallId);
  const door=openings.find(item => item.wallId===wallId);
  const center=length(wall)*door.t;
  return [center-door.width/2,center+door.width/2];
};
const [doorAStart,doorAEnd] = doorBounds('lower-divider');
const [rearDoorStart,rearDoorEnd] = doorBounds('rear-entry');


export const surveyDimensions = [
  h(field.upperLeftWidth,half,leftRoom-half,1.55),
  v(field.upperLeftDepth,.50,half,leftPartition-half),
  h(field.middleLeftWidth,half,leftRoom-middleDividerHalf,leftPartition+.47),
  v(field.middleLeftDepth,.50,leftPartition+half,leftRoomBottom-half),
  v(field.doorA,leftRoom-.45,leftPartition+doorAStart,leftPartition+doorAEnd,{suffix:' · A'}),
  h(field.annexWidth,annex+half,right-half,.52),
  v(field.annexDepth,right+.34,half,annexBottom-half),
  v(field.annexSide,annex-.30,entry,annexBottom),
  h(field.annexBottom,annex+half,right-half,annexBottom+.28,{reference:true}),
  h(field.upperRightWidth,leftRoom+half,right-half,leftPartition-.12,{reference:true}),
  v(field.upperRightDepth,right+.34,annexBottom+half,stripTop-half),
  h(field.stripWidth,passage+half,right-half,stripTop-.34,{approximate:true}),
  v(field.stripSide,passage-.32,stripTop,stripBottom,{reference:true}),
  v(field.stripDepth,passage+.55,stripTop+half,stripBottom-half),
  h(field.rearDoor,rearRoom+rearDoorStart,rearRoom+rearDoorEnd,stripBottom+.43),
  h(field.lowerLeftWidth,half,rearRoom-half,leftBottom-1.55),
  v(field.lowerLeftDepth,.52,leftRoomBottom+half,leftBottom-half),
  h(field.lowerRightWidth,rearRoom+half,right-half,rearBottom-1.25),
  v(field.lowerRightDepth,right-.52,stripBottom+half,rearBottom-half)
];

export function lowerLeftDoorDimensions(project) {
  const wall=project.walls.find(item => item.id==='left-lower');
  const bottomWall=project.walls.find(item => item.id==='bottom-left');
  const door=project.openings.find(item => item.id===previousLowerLeftDoor.id && item.wallId===wall?.id);
  if (!door || !bottomWall) return [];
  const [start,end]=interval(door,wall);
  const innerFace=wall.b.y-bottomWall.thickness/2;
  const jamb=wall.a.y+end;
  const offset=Math.abs(innerFace-jamb);
  if (Math.abs(door.width-metres(field.lowerLeftDoorWidth))>1e-6 ||
      Math.abs(offset-metres(field.lowerLeftDoorOffset))>1e-6) return [];
  return [
    v(field.lowerLeftDoorWidth,wall.a.x+.33,wall.a.y+start,jamb),
    v(field.lowerLeftDoorOffset,wall.a.x+.16,jamb,innerFace)
  ];
}
