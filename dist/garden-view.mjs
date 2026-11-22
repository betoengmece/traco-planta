import * as THREE from 'three';

const vertexShader=`
  varying vec3 gardenPoint;
  void main() {
    gardenPoint = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader=`
  uniform sampler2D photograph;
  uniform vec3 viewer;
  uniform vec2 openingHalf;
  uniform vec2 photoSize;
  uniform vec2 referenceEye;
  uniform bool orthographic;
  varying vec3 gardenPoint;

  void main() {
    if (viewer.z <= 0.0 || orthographic) discard;
    float openingT = viewer.z / (viewer.z - gardenPoint.z);
    vec2 throughWindow = mix(viewer.xy, gardenPoint.xy, openingT);
    if (any(greaterThan(abs(throughWindow), openingHalf))) discard;

    float projection = referenceEye.y / (referenceEye.y - gardenPoint.z);
    vec2 referencePoint = vec2(gardenPoint.x * projection,
      referenceEye.x + (gardenPoint.y - referenceEye.x) * projection);
    vec2 uv = referencePoint / photoSize + .5;
    // Extend edge colors into the small area outside the photographed field.
    vec2 edge = clamp(uv, vec2(.003), vec2(.997));
    vec3 color = texture2D(photograph, edge).rgb;
    float beyond = length(uv - edge);
    vec3 surround = mix(vec3(.13,.17,.07),vec3(.59,.70,.78),smoothstep(.14,.9,edge.y));
    color = mix(color,surround,smoothstep(.015,.22,beyond));
    gl_FragColor = vec4(color,1.0);
    #include <colorspace_fragment>
  }
`;

// Annotated regions of the supplied photo, in image coordinates measured from the top.
const leaves=[
  [.47,.565,.16,.18,1.25],
  [.34,.68,.10,.13,1.5],
  [.55,.35,.17,.26,1.9],
  [.57,.055,.34,.19,2.0],
  [.13,.37,.18,.27,1.9],
  [.76,.59,.13,.20,2.15]
];

function gardenDepth(u,y) {
  let depth=THREE.MathUtils.lerp(5.8,2.7,THREE.MathUtils.smoothstep(y,.48,.9));
  for (const [x,top,horizontal,vertical,near] of leaves) {
    const radius=Math.hypot((u-x)/horizontal,(y-top)/vertical);
    depth=Math.min(depth,THREE.MathUtils.lerp(near,depth,THREE.MathUtils.smoothstep(radius,.39,1.14)));
  }
  return depth;
}

export function createGardenView() {
  const geometry=new THREE.PlaneGeometry(1,1,64,52);
  const uniforms={
    photograph:{value:null},
    viewer:{value:new THREE.Vector3()},
    openingHalf:{value:new THREE.Vector2()},
    photoSize:{value:new THREE.Vector2()},
    referenceEye:{value:new THREE.Vector2()},
    orthographic:{value:false}
  };
  const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Paisagem da janela da cozinha';
  mesh.visible=false;
  let opening=null;
  let layered=false;
  let geometryKey='';

  mesh.onBeforeRender=(_renderer,_scene,camera) => {
    uniforms.orthographic.value=Boolean(camera.isOrthographicCamera);
    camera.getWorldPosition(uniforms.viewer.value);
    mesh.worldToLocal(uniforms.viewer.value);
  };

  function update() {
    const image=uniforms.photograph.value?.image;
    if (!opening || !image) return;
    const {width,height,eyeY,eyeZ}=opening;
    const aspect=image.naturalWidth ? image.naturalWidth/image.naturalHeight : image.width/image.height;
    const photoHeight=Math.max(height,width/aspect)*1.19;
    const photoWidth=photoHeight*aspect;
    const key=[width,height,eyeY,eyeZ,photoWidth,photoHeight,layered].join(',');
    if (geometryKey!==key) {
      geometryKey=key;
      uniforms.openingHalf.value.set(width/2,height/2);
      uniforms.photoSize.value.set(photoWidth,photoHeight);
      uniforms.referenceEye.value.set(eyeY,eyeZ);
      const points=geometry.attributes.position;
      const uv=geometry.attributes.uv;
      for (let i=0;i<points.count;i++) {
        const x=uv.getX(i)-.5;
        const y=uv.getY(i)-.5;
        const u=.5+x*2.6+Math.sign(x)*.9*Math.pow(Math.abs(x)*2,10);
        const v=.5+y*2.5+Math.sign(y)*.9*Math.pow(Math.abs(y)*2,10);
        const depth=layered ? gardenDepth(u,1-v) : 3.1;
        const scale=(eyeZ+depth)/eyeZ;
        points.setXYZ(i,(u-.5)*photoWidth*scale,eyeY+((v-.5)*photoHeight-eyeY)*scale,-depth);
      }
      points.needsUpdate=true;
      geometry.computeBoundingSphere();
    }
    mesh.visible=true;
  }

  return {
    mesh,
    setOpening(width,height,eyeY,eyeZ) {
      opening={width,height,eyeY,eyeZ};
      update();
    },
    setPhoto(image,usePlantDepth) {
      const previous=uniforms.photograph.value;
      const texture=new THREE.Texture(image);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.needsUpdate=true;
      uniforms.photograph.value=texture;
      previous?.dispose();
      layered=usePlantDepth;
      update();
    }
  };
}
