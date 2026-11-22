const garageWidth=3.08;
const narrowWidth=.87;
const recess=.45;
const gateDistance=2.10;

export function siteExterior(project) {
  const walls=new Map(project.walls.map(wall=>[wall.id,wall]));
  const upright=id=>{
    const wall=walls.get(id);
    return wall?.a.x===wall?.b.x ? wall : null;
  };
  const garageWall=upright('left-upper');
  const garageEnd=upright('left-lower');
  const kitchen=upright('right-main');
  const bathroom=upright('right-annex');
  if (!garageWall || !garageEnd || !kitchen || !bathroom ||
      Math.abs(garageWall.a.x-garageEnd.a.x)>.01 || Math.abs(kitchen.a.y-bathroom.b.y)>.05) return null;

  const houseLeft=garageWall.a.x-garageWall.thickness/2;
  const garage={
    left:houseLeft-garageWidth, right:houseLeft,
    rear:garageWall.a.y, front:garageEnd.b.y
  };
  const kitchenFace=kitchen.a.x+kitchen.thickness/2;
  const bathroomFace=kitchenFace+recess;
  const side={
    kitchenFace,bathroomFace,outer:bathroomFace+narrowWidth,
    recessY:kitchen.a.y,kitchenEnd:kitchen.b.y,gateY:kitchen.a.y-gateDistance,
    drawnBathroomFace:bathroom.a.x+bathroom.thickness/2,bathroomRear:bathroom.a.y
  };
  return {garage,side};
}
