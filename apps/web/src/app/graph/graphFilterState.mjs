const DEFAULT_GRAPH_NODE_TYPE = "Keyword";

export function getDefaultSelectedGraphTypes(entities = []) {
  const types = new Set();

  for (const entity of entities) {
    if (entity?.type) types.add(entity.type);
  }

  for (const type of types) {
    if (type.toLowerCase() === DEFAULT_GRAPH_NODE_TYPE.toLowerCase()) {
      return new Set([type]);
    }
  }

  return new Set();
}
