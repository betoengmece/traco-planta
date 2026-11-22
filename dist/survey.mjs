import { clamp, defaultWallThickness, interval, length, validateOpening } from './geometry.mjs';
import { defaultProject, houseLayout } from './template.mjs';
import { withWindowTypes } from './window-types.mjs';

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

// Elevation measured from inside the living room, facing the bottom wall of the plan.
const livingWindow = {
  left:83, right:65+tape, floor:101, ceiling:56, wallHeight:253+tape
};
const livingWindowWidth=field.lowerLeftWidth-livingWindow.left-livingWindow.right;
const livingWindowHeight=livingWindow.wallHeight-livingWindow.floor-livingWindow.ceiling;
const livingWindowWallId='bottom-left';
const livingWindowStartWallId='left-lower';
const livingWindowEndWallId='rear-side';
export const livingRoomLabel={x:rearRoom/2,y:leftBottom-.92};

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

const previousLivingWindow=previousOpenings.find(opening => opening.wallId===livingWindowWallId);
const livingWindowType='survey-living-window-lower';
const misplacedWindowType='survey-living-window';
const stockUpperWindow=previousOpenings.find(opening => opening.wallId==='top-left');

function restoreUpperWindow(project) {
  if (project?.template!=='survey') return project;
  const opening=project.openings.find(item => item.id===stockUpperWindow.id);
  const misplacedWidth=metres(field.upperLeftWidth-livingWindow.left-livingWindow.right);
  const misplacedT=(half+metres(livingWindow.left)+misplacedWidth/2)/leftRoom;
  if (opening?.wallId!=='top-left' || opening.typeId!==misplacedWindowType ||
      opening.t!==misplacedT || opening.width!==misplacedWidth ||
      opening.height!==metres(livingWindowHeight) || opening.sill!==metres(livingWindow.floor) ||
      opening.casement!==stockUpperWindow.casement) return project;

  const wall=project.walls.find(item => item.id===opening.wallId);
  const stockType=project.windowTypes?.find(type => !type.casement &&
    ['width','height','sill'].every(key => type[key]===stockUpperWindow[key]));
  if (!wall || !stockType) return project;
  const restoredWindow={...stockUpperWindow,typeId:stockType.id};
  const restoredWall={...wall,height:2.5};
  const openings=project.openings.map(item => item===opening ? restoredWindow : item);
  if (!validateOpening(restoredWindow,wall,openings)) return project;
  const resetHeight=wall.height===metres(livingWindow.wallHeight) &&
    openings.filter(item => item.wallId===wall.id).every(item => validateOpening(item,restoredWall,openings));
  const stillUsed=openings.some(item => item.typeId===misplacedWindowType);
  return {
    ...project,openings,
    walls:resetHeight ? project.walls.map(item => item===wall ? restoredWall : item) : project.walls,
    windowTypes:stillUsed ? project.windowTypes : project.windowTypes.filter(type => type.id!==misplacedWindowType)
  };
}

function applyLivingWindowSurvey(project) {
  if (project?.template!=='survey') return project;
  const opening=project.openings.find(item => item.id===previousLivingWindow.id);
  const wall=project.walls.find(item => item.id===livingWindowWallId);
  if (!wall || wall.height!==2.5 || opening?.wallId!==wall.id ||
      !['t','width','height','sill','casement'].every(key => opening[key]===previousLivingWindow[key])) return project;

  const startWall=project.walls.find(item => item.id===livingWindowStartWallId);
  const endWall=project.walls.find(item => item.id===livingWindowEndWallId);
  if (!startWall || !endWall ||
      Math.abs(length(wall)-(startWall.thickness+endWall.thickness)/2-metres(field.lowerLeftWidth))>1e-6) return project;

  const width=metres(livingWindowWidth);
  const height=metres(livingWindowHeight);
  const sill=metres(livingWindow.floor);
  const measuredWall={...wall,height:metres(livingWindow.wallHeight)};
  const measuredWindow={
    ...opening,width,height,sill,typeId:livingWindowType,
    // Facing the bottom wall reverses the observer's left/right relative to plan x.
    t:(startWall.thickness/2+metres(livingWindow.right)+width/2)/length(wall)
  };
  if (!validateOpening(measuredWindow,measuredWall,project.openings)) return project;
  const withTypes=withWindowTypes(project);
  const measuredType={id:livingWindowType,name:'Janela da sala',width,height,sill,casement:false};
  return {
    ...withTypes,
    walls:project.walls.map(item => item===wall ? measuredWall : item),
    openings:withTypes.openings.map(item => item.id===opening.id ? measuredWindow : item),
    windowTypes:[...withTypes.windowTypes,measuredType]
  };
}

export function withSurveyCorrections(project) {
  const update=copy => applyLivingWindowSurvey(restoreUpperWindow(correctSurveyCopy(copy)));
  const corrected=update(project);
  const original=update(project.original);
  return original===project.original ? corrected : {...corrected,original};
}

const originalSurvey=withSurveyCorrections({
  name:'Levantamento da casa',walls,openings:previousOpenings,template:'survey',wallThickness:thickness
});

export function surveyProject() {
  return {...structuredClone(originalSurvey),original:structuredClone(originalSurvey)};
}

export const surveyDoors = { aWidth:field.doorA, aHeight:field.doorAHeight, bWidth:field.doorB };

const h = (cm, x1, x2, y, options) => ({cm,a:{x:x1,y},b:{x:x2,y},...options});
const v = (cm, x, y1, y2, options) => ({cm,a:{x,y:y1},b:{x,y:y2},...options});
const doorBounds = wallId => {
  const wall=walls.find(item => item.id===wallId);
  const door=originalSurvey.openings.find(item => item.wallId===wallId);
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

export function livingWindowDimensions(project) {
  const wall=project.walls.find(item => item.id===livingWindowWallId);
  const opening=project.openings.find(item => item.typeId===livingWindowType && item.wallId===wall?.id);
  const startWall=project.walls.find(item => item.id===livingWindowStartWallId);
  const endWall=project.walls.find(item => item.id===livingWindowEndWallId);
  if (!opening || !startWall || !endWall) return [];
  const [start,end]=interval(opening,wall);
  const left=wall.a.x+startWall.thickness/2;
  const right=wall.b.x-endWall.thickness/2;
  const y=wall.a.y-.37;
  return [
    h((wall.a.x+start-left)*100,left,wall.a.x+start,y),
    h(opening.width*100,wall.a.x+start,wall.a.x+end,y),
    h((right-wall.a.x-end)*100,wall.a.x+end,right,y)
  ];
}

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
