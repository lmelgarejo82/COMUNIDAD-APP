import { useState, useCallback, useEffect } from 'react';
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

export default function useHierarchyActions(complexId) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = useCallback((text, type = 'success') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 3500);
  }, []);

  const loadTree = useCallback(async () => {
    if (!complexId) { setTree(null); setLoading(false); return; }
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

  useEffect(() => { loadTree(); }, [loadTree]);

  const createFromPalette = useCallback(async (childType, parentNode) => {
    try {
      if (childType === 'building') {
        await hierarchyService.createBuilding({ complex_id: parentNode.id, name: 'Nuevo Edificio', building_type: 'tower' });
      } else if (childType === 'floor') {
        await hierarchyService.createFloor({ building_id: parentNode.id, number: 1, name: 'Nuevo Piso' });
      } else if (childType === 'unit') {
        const code = `U${Date.now().toString(36).slice(-4).toUpperCase()}`;
        await hierarchyService.createUnit({ floor_id: parentNode.id, unit_code: code });
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
    const expected = TARGET_PARENT[srcType];
    if (tgtType !== expected) {
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

  const updateNode = useCallback(async (nodeType, nodeId, data) => {
    const updaters = {
      complex: (id, d) => hierarchyService.updateComplex(id, d),
      building: (id, d) => hierarchyService.updateBuilding(id, d),
      floor: (id, d) => hierarchyService.updateFloor(id, d),
      unit: (id, d) => hierarchyService.updateUnit(id, d),
    };
    await (updaters[nodeType] || (() => {}))(nodeId, data);
    showMsg('Guardado correctamente');
    await loadTree();
  }, [loadTree, showMsg]);

  const deleteNode = useCallback(async (nodeType, node) => {
    const deleters = {
      complex: (id) => hierarchyService.deleteComplex(id),
      building: (id) => hierarchyService.deleteBuilding(id),
      floor: (id) => hierarchyService.deleteFloor(id),
      unit: (id) => hierarchyService.deleteUnit(id),
    };
    await (deleters[nodeType] || (() => {}))(node.id);
    showMsg('Eliminado correctamente');
    await loadTree();
  }, [loadTree, showMsg]);

  const bulkCreate = useCallback(async (payload, parentNode, parentType) => {
    try {
      if (Array.isArray(payload) && parentType === 'floor') {
        for (const unit of payload) {
          await hierarchyService.createUnit({ floor_id: parentNode.id, ...unit });
        }
      } else {
        await hierarchyService.bulkCreate(payload);
      }
      showMsg('Creado correctamente');
      await loadTree();
    } catch (err) {
      throw err;
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
      await createFromPalette(childType, target.node);
    } else if (source.source === 'tree') {
      await moveNode(source.type, source.node, target.type, target.node);
    }
  }, [createFromPalette, moveNode, showMsg]);

  return {
    tree, loading, msg, msgType,
    loadTree, createFromPalette, moveNode, updateNode, deleteNode, bulkCreate, handleDragEnd,
  };
}

export { VALID_DROPS, TARGET_PARENT };
