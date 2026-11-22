import * as THREE from 'three';

export function makeExterior(interior) {
  const blockGeometry=new THREE.BoxGeometry(1,1,1);
  const paint=color=>new THREE.MeshStandardMaterial({color,roughness:.92});
  const plaster=paint('#c2c297'),masonry=paint('#8b8072');
  const wood=paint('#b7ab92'),tile=paint('#92513e'),metal=paint('#6b7773');
  const extension=2.55;

  function create(site,building,frontWall) {
    const {garage,side}=site;
    const group=new THREE.Group();
    group.name='Garagem e áreas externas';
    const barriers=[];
    function block(name,x,y,z,width,height,depth,material,angle=0) {
      const mesh=new THREE.Mesh(blockGeometry,material);
      mesh.name=name;
      mesh.position.set(x,y,z);
      mesh.scale.set(width,height,depth);
      mesh.rotation.z=angle;
      mesh.receiveShadow=true;
      mesh.castShadow=true;
      group.add(mesh);
      return mesh;
    }
    function floor(name,left,top,right,bottom,finish) {
      if (right<=left || bottom<=top) return;
      const mesh=interior.roomSurface({left,right,top,bottom,finish},false);
      mesh.name=name;
      mesh.userData.exteriorSurface=true;
      group.add(mesh);
    }
    function wall(name,x,from,to,height,thickness,material) {
      if (to<=from) return;
      const center=(from+to)/2;
      block(name,x,height/2,center,thickness,height,to-from,material);
      barriers.push({x,y:from,ux:0,uy:1,half:thickness/2,start:0,end:to-from});
    }

    const streetFront=building.y+building.depth+.075;
    const front=streetFront+extension;
    const garageWidth=garage.right-garage.left;
    const garageLength=garage.front-garage.rear;
    const garageX=(garage.left+garage.right)/2;
    const garageY=(garage.rear+garage.front)/2;
    floor('Piso vermelho da garagem',garage.left,garage.rear,garage.right,garage.front,'garageTile');
    floor('Acesso à garagem',garage.left,garage.front,garage.right,front,'garageTile');
    floor('Pátio da frente',garage.right,streetFront,side.outer,front,'paving');
    if (frontWall) {
      const stepFace=Math.max(frontWall.a.x,frontWall.b.x)-frontWall.thickness/2;
      floor('Faixa junto à fachada',garage.right,garage.front,stepFace,streetFront,'paving');
    }
    wall('Muro da garagem',garage.left-.065,garage.rear,front,2.30,.13,plaster);
    const low=2.33,high=2.82;
    const slope=Math.atan2(high-low,garageWidth);
    const span=Math.hypot(garageWidth,high-low);
    block('Cobertura inclinada de telhas',garageX,(low+high)/2+.07,garageY,span+.17,.13,garageLength+.22,tile,slope);
    block('Testeira frontal da garagem',garageX,(low+high)/2,garage.front+.11,span+.18,.12,.10,wood,slope);
    for (let y=garage.rear+.22;y<garage.front;y+=.67) {
      block('Viga transversal da garagem',garageX,(low+high)/2-.025,y,span,.13,.10,wood,slope);
    }
    for (let i=1;i<5;i++) {
      const fraction=i/5;
      block('Ripa longitudinal',garage.left+garageWidth*fraction,low+(high-low)*fraction-.028,
        garageY,.049,.073,garageLength,wood);
    }

    floor('Corredor estreito junto ao banheiro',side.bathroomFace,side.gateY,side.outer,side.recessY,'path');
    floor('Corredor lateral junto à cozinha',side.kitchenFace,side.recessY,side.outer,streetFront,'path');
    floor('Faixa de jardim',side.outer,streetFront,side.outer+.62,front,'grass');
    wall('Muro baixo do corredor lateral',side.outer+.065,side.gateY,streetFront,1.12,.13,masonry);
    if (side.drawnBathroomFace<side.bathroomFace) {
      const width=side.bathroomFace-side.drawnBathroomFace;
      wall('Avanço externo do banheiro dos fundos',(side.drawnBathroomFace+side.bathroomFace)/2,
        side.bathroomRear,side.recessY,2.50,width,plaster);
    }
    const gateWidth=side.outer-side.bathroomFace;
    for (let i=0;i<=7;i++) {
      block('Grade do portão antigo',side.bathroomFace+gateWidth*i/7,.58,side.gateY,.022,1.16,.035,metal);
    }
    for (const height of [.19,.97]) {
      block('Travessa do portão antigo',(side.bathroomFace+side.outer)/2,height,side.gateY,gateWidth,.031,.035,metal);
    }
    barriers.push({x:side.bathroomFace,y:side.gateY,ux:1,uy:0,half:.025,start:0,end:gateWidth});

    const y=Math.min(building.y,garage.rear,side.gateY);
    return {
      group,barriers,
      bounds:{x:garage.left-.13,y,width:side.outer+.62-garage.left+.13,depth:front-y},
      garageStart:{x:garageX,y:garage.front-.45},
      garageTarget:{x:garageX,y:garage.rear}
    };
  }
  return {create};
}
