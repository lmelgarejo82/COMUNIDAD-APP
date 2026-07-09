import { useState, useEffect, useCallback } from 'react';
import { hierarchyService } from '../services/hierarchy';
import { getErrorMessage } from '../services/errors';

const VALID_DROPS = {
  complex: 'building',
  building: 'floor',
  floor: 'unit',
};

const TARGET_PARENT = {
  building: 'complex',
  floor: 'building',
  unit: 'floor',
};

export default function useHierarchy(complexId) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = useCallback((text, type = 'success') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 3000);
  }, []);

  const loadTree = useCallback(async () => {
    if (!complexId) return;
    setLoading(true);
    try {
      const { data } = await hierarchyService.getTree(complexId);
      setTree(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al cargar estructura'), 'error');
    } finally {
      setLoading(false);
    }
  }, [complexId, showMsg]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const createNode = useCallback(async (childType, parentNode) => {
    try {
      if (childType === 'building') {
        await hierarchyService.createBuilding({ complex_id: parentNode.id, name: 'Nuevo Edificio', building_type: 'tower' });
      } else if (childType === 'floor') {
        await hierarchyService.createFloor({ building_id: parentNode.id, number: 1, name: 'Nuevo Piso' });
      } else if (childType === 'unit') {
        const unitCode = `U${Date.now().toString(36).slice(-4).toUpperCase()}`;
        await hierarchyService.createUnit({ floor_id: parentNode.id, unit_code: unitCode });
      } else if (childType === 'complex') {
        await hierarchyService.createComplex({ name: 'Nuevo Complejo' });
      }
      showMsg('Creado correctamente');
      await loadTree();
      return true;
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al crear'), 'error');
      return false;
    }
  }, [loadTree, showMsg]);

  const moveNode = useCallback(async (srcType, srcNode, tgtType, tgtNode) => {
    if (srcNode.id === tgtNode.id) return false;

    const expectedParent = TARGET_PARENT[srcType];
    if (tgtType !== expectedParent) {
      showMsg(`${srcType} no se puede mover a ${tgtType}`, 'error');
      return false;
    }

    try {
      if (srcType === 'building') {
        await hierarchyService.moveBuilding(srcNode.id, tgtNode.id);
      } else if (srcType === 'floor') {
        await hierarchyService.moveFloor(srcNode.id, tgtNode.id);
      } else if (srcType === 'unit') {
        await hierarchyService.moveUnit(srcNode.id, tgtNode.id);
      }
      showMsg('Movido correctamente');
      await loadTree();
      return true;
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al mover'), 'error');
      return false;
    }
  }, [loadTree, showMsg]);

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    if (!over) return;

    const source = active.data.current;
    const target = over.data.current;

    if (source.source === 'palette') {
      const childType = source.type;
      const parentType = target.type;
      if (VALID_DROPS[parentType] !== childType) {
        showMsg(`${childType} no se puede soltar sobre ${parentType}`, 'error');
        return;
      }
      await createNode(childType, target.node);
    } else if (source.source === 'tree') {
      await moveNode(source.type, source.node, target.type, target.node);
    }
  }, [createNode, moveNode, showMsg]);

  const updateNode = useCallback(async (nodeType, nodeId, data) => {
    try {
      if (nodeType === 'complex') await hierarchyService.updateComplex(nodeId, data);
      else if (nodeType === 'building') await hierarchyService.updateBuilding(nodeId, data);
      else if (nodeType === 'floor') await hierarchyService.updateFloor(nodeId, data);
      else if (nodeType === 'unit') await hierarchyService.updateUnit(nodeId, data);
      showMsg('Guardado correctamente');
      await loadTree();
    } catch (err) {
      throw err;
    }
  }, [loadTree, showMsg]);

  const deleteNode = useCallback(async (nodeType, node) => {
    try {
      if (nodeType === 'complex') await hierarchyService.deleteComplex(node.id);
      else if (nodeType === 'building') await hierarchyService.deleteBuilding(node.id);
      else if (nodeType === 'floor') await hierarchyService.deleteFloor(node.id);
      else if (nodeType === 'unit') await hierarchyService.deleteUnit(node.id);
      showMsg('Eliminado correctamente');
      await loadTree();
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al eliminar'), 'error');
      throw err;
    }
  }, [loadTree, showMsg]);

  const bulkCreate = useCallback(async (payload) => {
    try {
      await hierarchyService.bulkCreate(payload);
      showMsg('Creado correctamente');
      await loadTree();
    } catch (err) {
      throw err;
    }
  }, [loadTree, showMsg]);

  const reorderNodes = useCallback(async (nodeType, parentId, orderedIds) => {
    try {
      if (nodeType === 'unit') {
        const entries = orderedIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
        await hierarchyService.reorganizeUnits(entries);
      }
      showMsg('Reordenado correctamente');
      await loadTree();
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al reordenar'), 'error');
    }
  }, [loadTree, showMsg]);

  return {
    tree,
    loading,
    msg,
    msgType,
    loadTree,
    createNode,
    moveNode,
    updateNode,
    deleteNode,
    bulkCreate,
    handleDragEnd,
    reorderNodes,
  };
}
