import { length, validateOpening } from './geometry.mjs';

export const kitchenOptions=[
  {id:'linear',title:'Troca · cozinha linear',detail:'Bancada de 60 cm de profundidade. Pia de 90 cm, fogão de 60 cm, geladeira de 65 cm e aéreos de 35 cm. O corredor dá acesso aos cômodos. O banheiro dos fundos fica com acesso pelo novo quarto.'},
  {id:'l',title:'Troca · cozinha em L',detail:'Bancada de 60 cm com retorno de 70 cm na lateral, aéreos de 35 cm e mesa de 100 × 65 cm. O banheiro dos fundos fica com acesso pelo novo quarto.'},
  {id:'current',title:'Cozinha no lugar atual',detail:'Bancada de 60 cm com pia de 90 cm, fogão de 60 cm, aéreos de 35 cm e mesa de 100 × 60 cm. Mantém a cozinha perto dos pontos atuais.'}
];

export function kitchenOptionPlan(original,id) {
  const option=kitchenOptions.find(option=>option.id===id);
  if (!option) return null;
  const plan={...structuredClone(original),kitchenOption:id};
  if (id==='current') return plan;

  const left=plan.walls.find(wall=>wall.id==='middle-divider');
  const top=plan.walls.find(wall=>wall.id==='annex-bottom');
  const bottom=plan.walls.find(wall=>wall.id==='strip-top');
  const right=plan.walls.find(wall=>wall.id==='right-main');
  if (!left || !top || !bottom || !right || left.a.x!==left.b.x ||
      right.a.x!==right.b.x || top.a.y!==top.b.y || bottom.a.y!==bottom.b.y ||
      right.a.x-left.a.x<3.2 || bottom.a.y-top.a.y<3.0) return null;
  const x=left.a.x+1.05;
  const wall={id:'proposal-bedroom-divider',a:{x,y:top.a.y},b:{x,y:bottom.a.y},
    thickness:.12,height:Math.min(top.height,bottom.height)};
  const door={id:'proposal-bedroom-door',type:'door',wallId:wall.id,
    width:.80,height:2.10,sill:0,t:1.04/length(wall),hinge:'start',side:-1};
  if (!validateOpening(door,wall,plan.openings)) return null;
  plan.walls.push(wall);
  plan.openings.push(door);
  return plan;
}
