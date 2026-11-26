import * as THREE from 'three';

const tones={
  terracotta:[143,89,56],grayTile:[158,156,148],parquet:[148,103,66],
  neutral:[177,159,132],slats:[227,222,209],panels:[221,215,201],
  garageTile:[158,74,55],paving:[137,130,121],path:[145,110,97],grass:[104,126,80],
  bathPattern:[131,75,48],bathClay:[138,92,71],bathBlue:[155,193,193],bathCream:[225,203,145]
};
function finishTexture(kind) {
  const size=128;
  const bytes=new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) {
    for (let x=0;x<size;x++) {
      const u=x/size,v=y/size;
      let shade=0;
      if (kind==='parquet') {
        const column=Math.floor(u*4),row=Math.floor(v*4);
        const a=u*4-column,b=v*4-row,flip=(column+row)%2;
        const cross=flip ? a : b;
        const along=flip ? b : a;
        const plank=Math.floor(cross*4);
        shade=((plank*17+column*9+row*29)%25)-12+Math.sin(cross*160+Math.sin(along*12))*4;
        if (cross*4%1<.045 || along<.026) shade-=30;
      } else if (kind==='grayTile' || kind==='terracotta') {
        const a=u*3%1,b=v*3%1;
        const seam=Math.min(a,1-a,b,1-b)<.018;
        shade=kind==='grayTile'
          ? (seam ? -44 : Math.sin(24*a+Math.sin(b*16)*2)*6+Math.cos(17*b)*5)
          : (seam ? 21 : Math.abs(Math.abs(a-.5)+Math.abs(b-.5)-.44)<.023 ? 19 : 0);
      } else if (['garageTile','bathClay','bathBlue','bathCream','bathPattern'].includes(kind)) {
        const a=u*3%1,b=v*3%1;
        const seam=Math.min(a,b,1-a,1-b)<.028;
        const dx=a-.5,dy=b-.5;
        const ring=Math.hypot(dx,dy);
        const petal=.23+Math.cos(Math.atan2(dy,dx)*8)*.066;
        shade=seam ? 22 : kind==='bathPattern' && (Math.abs(ring-petal)<.023 || Math.abs(ring-.39)<.012) ? 32 : 0;
      } else if (kind==='paving'||kind==='path'||kind==='grass') {
        shade=Math.sin(x*2.71+y*6.57)*3+Math.sin(x*.49+y*.73)*4;
      } else if (kind==='slats') shade=u*9%1<.073 ? -20 : 0;
      else if (kind==='panels') shade=u<.014 || v<.014 ? -19 : 0;
      const index=(y*size+x)*4;
      for (let channel=0;channel<3;channel++) bytes[index+channel]=tones[kind][channel]+shade;
      bytes[index+3]=255;
    }
  }
  const texture=new THREE.DataTexture(bytes,size,size);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

export function makeInterior() {
  const cache=new Map();
  const paint=(color,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const white=paint('#e4e0d2'), oak=paint('#b08b64'), walnut=paint('#604633');
  const dark=paint('#272724'), granite=paint('#494740',.64), steel=paint('#9da7a6',.30,.62);
  const ceramic=paint('#f1ead8',.38),drain=paint('#575447',.40),mirror=paint('#aab9b9',.16,.52);
  const basin=new THREE.LatheGeometry([
    new THREE.Vector2(0,-.060),new THREE.Vector2(.22,-.060),
    new THREE.Vector2(.40,-.028),new THREE.Vector2(.474,.040),
    new THREE.Vector2(.50,.052),new THREE.Vector2(.493,.015),
    new THREE.Vector2(.46,-.081),new THREE.Vector2(.27,-.115),new THREE.Vector2(0,-.115)
  ],24);
  const oval=new THREE.SphereGeometry(1,18,12);
  const duvet=paint('#c997a7'), linen=paint('#e5d8d3');
  const bookColors=['#9c5141','#777c46','#c2a383','#536c78','#9e7643'].map(color=>paint(color));

  function finish(kind) {
    if (!cache.has(kind)) {
      const ceiling=kind==='slats'||kind==='panels';
      const material=new THREE.MeshStandardMaterial({map:finishTexture(kind),roughness:.96,
        emissive:ceiling ? '#777165' : '#000000',emissiveIntensity:.24});
      cache.set(kind,material);
    }
    return cache.get(kind);
  }

  function roomSurface(room,ceiling) {
    const width=room.right-room.left,depth=room.bottom-room.top;
    // Single-sided plane, so the roof cannot close off the orbit view.
    const geometry=new THREE.PlaneGeometry(width,depth);
    geometry.rotateX(ceiling ? Math.PI/2 : -Math.PI/2);
    const uv=geometry.attributes.uv;
    const frequency=ceiling && room.ceiling==='panels' ? .50 : 1;
    for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*width*frequency,uv.getY(i)*depth*frequency);
    const mesh=new THREE.Mesh(geometry,finish(ceiling ? room.ceiling : room.finish));
    mesh.position.set((room.left+room.right)/2,ceiling ? 2.50 : -.012,(room.top+room.bottom)/2);
    mesh.receiveShadow=!ceiling;
    return mesh;
  }

  function furnishing(spec,solid) {
    const group=new THREE.Group();
    group.name=spec.kind;
    group.position.set(spec.x,0,spec.y);
    group.rotation.y=spec.rotation*Math.PI/2;
    const {width:w,depth:d}=spec;
    const add=(x,y,z,width,height,depth,material)=>solid(group,x,y,z,width,height,depth,material);
    const front=d/2;
    function ceramicPiece(geometry,x,y,z,width,height,depth,material=ceramic) {
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(x,y,z);
      mesh.scale.set(width,height,depth);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      group.add(mesh);
    }
    function handle(x,y,z,wide=.10) { add(x,y,z,wide,.018,.018,steel); }
    function legs(height,material) {
      for(const x of [-1,1]) for(const z of [-1,1])
        add(x*(w/2-.055),height/2,z*(d/2-.055),.045,height,.045,material);
    }
    function cabinet(height,body,doors) {
      add(0,height/2,0,w,height,d,body);
      const span=w/doors;
      for(let i=0;i<doors;i++) {
        const x=(i+.5)*span-w/2;
        add(x,height/2,front+.009,span-.015,height-.034,.018,body);
        handle(x+span*.22,height*.54,front+.026,.064);
      }
    }

    switch(spec.kind) {
      case 'block':
        add(0,spec.height/2,0,w,spec.height,d,oak);
        break;
      case 'sink':
        cabinet(.84,white,3);
        add(0,.87,-.03,w,.057,d-.06,granite);
        add(-w*.36,.873,.18,w*.28,.052,.22,granite);
        add(w*.36,.873,.18,w*.28,.052,.22,granite);
        add(0,.845,.13,w*.44,.023,.34,steel);
        add(0,.96,-.11,.035,.17,.03,steel);
        add(0,1.032,-.052,.036,.032,.143,steel);
        break;
      case 'stove':
        add(0,.44,0,w,.88,d,white);
        add(0,.43,front+.012,w*.86,.53,.023,dark);
        add(0,.866,0,w,.04,d,steel);
        for(const x of [-1,1]) for(const z of [-1,1]) add(x*w*.25,.899,z*d*.25,w*.28,.027,d*.26,dark);
        handle(0,.66,front+.037,w*.68);
        break;
      case 'fridge':
        add(0,.87,0,w,1.74,d,white);
        add(0,1.48,front+.016,w*.98,.51,.032,white);
        add(0,.61,front+.016,w*.98,1.19,.032,white);
        add(-w*.35,1.40,front+.043,.026,.16,.026,steel);
        add(-w*.35,1.02,front+.043,.026,.22,.026,steel);
        break;
      case 'wallCabinet':
        group.position.y=1.67;
        cabinet(.59,white,3);
        break;
      case 'cabinet':
        cabinet(.88,white,2);
        add(0,.90,0,w,.045,d+.02,granite);
        break;
      case 'table':
        add(0,.75,0,w,.048,d,granite);
        legs(.73,dark);
        break;
      case 'chair':
        add(0,.45,0,w,.05,d,walnut);
        add(0,.68,-front+.03,w,.43,.055,walnut);
        legs(.43,walnut);
        break;
      case 'singleBed':
      case 'bed':
        add(0,.19,0,w,.34,d,walnut);
        add(0,.43,0,w,.18,d,linen);
        add(0,.535,.18,w+.024,.035,d-.35,duvet);
        for(const side of spec.kind==='singleBed' ? [0] : [-1,1]) add(side*w*.24,.57,-d*.33,w*(side ? .40 : .65),.084,.35,linen);
        break;
      case 'crib':
        add(0,.25,0,w,.13,d,oak);
        add(0,.345,0,w-.07,.115,d-.08,linen);
        for (const side of [-1,1]) {
          add(side*(w/2-.025),.93,0,.05,.06,d,oak);
          add(0,.93,side*(d/2-.03),w,.06,.06,oak);
          for (let i=0;i<12;i++) add(side*(w/2-.025),.59,(i/11-.5)*(d-.06),.026,.64,.028,oak);
          for (let i=0;i<6;i++) add((i/5-.5)*(w-.04),.59,side*(d/2-.03),.024,.64,.028,oak);
        }
        break;
      case 'smallCabinet':
      case 'shoeRack':
        cabinet(spec.height??.80,oak,2);
        break;
      case 'sofa':
        add(0,.23,0,w,.30,d,duvet);
        add(0,.60,d*.38,w,.44,d*.24,duvet);
        break;
      case 'tv':
        add(0,spec.elevation??1.20,0,w,spec.height??.62,d,dark);
        break;
      case 'nightstand':
      case 'dresser': {
        const height=spec.kind==='dresser' ? .89 : .50;
        add(0,height/2,0,w,height,d,white);
        for(let i=0;i<3;i++) {
          const y=(i+.5)*height/3;
          add(0,y,front+.008,w-.021,height/3-.014,.015,white);
          handle(0,y,front+.023,w*.26);
        }
        break;
      }
      case 'wardrobe':
      case 'wardrobeWhite':
        cabinet(spec.kind==='wardrobe' ? 1.98 : 1.86,spec.kind==='wardrobe' ? oak : white,4);
        break;
      case 'desk':
      case 'sewing':
        add(0,.745,0,w,.05,d,walnut);
        legs(.72,walnut);
        if (spec.kind==='desk') {
          add(0,.81,-.09,.20,.055,.09,dark);
          add(0,1.01,-.14,w*.47,.255,.028,dark);
        } else {
          add(0,.797,0,.39,.055,.18,white);
          add(.11,.90,0,.14,.18,.15,white);
          add(.015,.965,0,.31,.07,.15,white);
        }
        break;
      case 'toilet':
        ceramicPiece(oval,0,.15,.02,w*.29,.15,d*.27);
        ceramicPiece(basin,0,.389,.037,w,1.36,d*.72);
        ceramicPiece(oval,0,.325,.04,.034,.006,.033,drain);
        break;
      case 'bathSink':
        ceramicPiece(oval,0,.40,-.042,w*.16,.39,d*.18);
        ceramicPiece(basin,0,.822,0,w,1,d);
        add(0,.913,-front+.06,.019,.15,.02,steel);
        add(0,.977,-front+.095,.020,.022,.085,steel);
        add(0,1.40,-front+.015,w*.91,.51,.024,ceramic);
        add(0,1.40,-front+.029,w*.82,.455,.006,mirror);
        break;
      case 'cistern':
        add(0,1.99,0,w,.33,d,ceramic);
        add(0,1.129,0,.042,1.47,.042,ceramic);
        break;
      case 'shelves':
        for(const y of [1.12,1.60]) {
          add(0,y,0,w,.034,d,oak);
          for(let i=0;i<12;i++) {
            const x=-w*.41+w*.073*i;
            const height=.10+(i%4)*.026;
            add(x,y+.02+height/2,0,w*.049,height,d*.64,bookColors[i%bookColors.length]);
          }
        }
        break;
    }
    return group;
  }
  return {roomSurface,furnishing,finish};
}
