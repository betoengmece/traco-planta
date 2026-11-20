import { validateOpening } from './geometry.mjs';

const stock = [
  { id:'sliding', name:'Janela de correr', casement:false, width:1.2, height:1.05, sill:.95 },
  { id:'casement', name:'Janela dupla de abrir', casement:true, width:1.152, height:1.34, sill:.87 }
];
const measurements = ['width','height','sill'];

export function withWindowTypes(project) {
  if (Array.isArray(project.windowTypes)) return project;
  const windowTypes = [];
  const openings = project.openings.map(opening => {
    if (opening.type !== 'window') return opening;
    const model = stock.find(type => type.casement === Boolean(opening.casement));
    const variants = windowTypes.filter(type => type.casement === model.casement);
    let type = variants.find(candidate => measurements.every(key => candidate[key] === opening[key]));
    if (!type) {
      const suffix = variants.length ? ' ' + (variants.length+1) : '';
      type = { ...model, id:suffix ? model.id+'-'+(variants.length+1) : model.id, name:model.name+suffix,
        width:opening.width, height:opening.height, sill:opening.sill };
      windowTypes.push(type);
    }
    return { ...opening, typeId:type.id };
  });
  for (const model of stock) {
    if (!windowTypes.some(type => type.id === model.id)) windowTypes.push({ ...model });
  }
  windowTypes.sort((a,b) => Number(a.casement)-Number(b.casement));
  return { ...project, openings, windowTypes };
}

export function resizeWindowType(project,typeId,field,value) {
  if (!measurements.includes(field) || !Number.isFinite(value) ||
      !project.windowTypes.some(type => type.id === typeId)) return null;
  const matches = opening => opening.type === 'window' && opening.typeId === typeId;
  const openings = project.openings.map(opening => matches(opening) ? { ...opening, [field]:value } : opening);
  const changed = openings.filter(matches);
  const walls = new Map(project.walls.map(wall => [wall.id,wall]));
  if (changed.some(opening => !validateOpening(opening,walls.get(opening.wallId),openings))) return null;
  return {
    openings,
    windowTypes:project.windowTypes.map(type => type.id === typeId ? { ...type, [field]:value } : type),
    count:changed.length
  };
}
