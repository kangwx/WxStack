// Pure scene composition helper. The caller decides whether/where to write.
function mountPrefab(scene, prefab, parentId) {
  if (prefab[0]?.__type__ !== 'cc.Prefab' || scene[parentId]?.__type__ !== 'cc.Node') throw new Error('Expected a Creator prefab and a scene Node parent');
  const start=scene.length;
  const offset=start-1;
  const objects=structuredClone(prefab.slice(1));
  function remap(value){if(!value||typeof value!=='object')return;if('__id__'in value)value.__id__+=offset;for(const child of Object.values(value))remap(child);}
  for(const object of objects)remap(object);
  const rootId=prefab[0].data.__id__+offset;
  objects[rootId-start]._parent={__id__:parentId};
  scene[parentId]._children.push({__id__:rootId});
  scene.push(...objects);
  return {rootId,objects,offset};
}
module.exports={mountPrefab};
