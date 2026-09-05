import { useState, useEffect, useRef } from 'react';
import { expenseService } from '../services/expensas';
import { paymentService } from '../services/payments';
import { capabilityService } from '../services/capabilities';
import { downloadProtectedUpload } from '../services/protectedUploads';
import { useAuth } from '../context/AuthContext';
import CreateExpensa from './CreateExpensa';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import {
  manualPaymentActions,
  manualPaymentStatus,
  validatePaymentProof,
} from '../utils/manualPayment';

function ResidentView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [files, setFiles] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [feedback, setFeedback] = useState({});
  const [unreconciled, setUnreconciled] = useState({});
  const [mercadoPagoAvailable, setMercadoPagoAvailable] = useState(false);
  const [payingWithMp, setPayingWithMp] = useState({});
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const submitOperationsRef = useRef({});
  const mpOperationsRef = useRef({});

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
      submitOperationsRef.current = {};
      mpOperationsRef.current = {};
    };
  }, []);

  useEffect(() => {
    let active = true;
    capabilityService.get().then((capabilities) => {
      if (active) setMercadoPagoAvailable(capabilities.mercadoPago === true);
    });
    return () => { active = false; };
  }, []);

  async function load(showSpinner = true, publishError = true) {
    const generation = ++loadGenerationRef.current;
    if (showSpinner) setLoading(true);
    if (publishError) setLoadError('');
    try {
      const { data } = await expenseService.listMy();
      if (!mountedRef.current || generation !== loadGenerationRef.current) return false;
      setItems(data);
      setLoadError('');
      setUnreconciled({});
      return true;
    } catch (err) {
      if (!mountedRef.current || generation !== loadGenerationRef.current) return false;
      if (publishError) setLoadError(getErrorMessage(err, 'Error al cargar expensas'));
      return false;
    } finally {
      if (showSpinner && mountedRef.current && generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  async function retryReconciliation(unitExpenseId) {
    setSubmitting((current) => ({ ...current, [unitExpenseId]: true }));
    const refreshed = await load(false, false);
    if (!mountedRef.current) return;
    if (!refreshed) {
      setFeedback((current) => ({
        ...current,
        [unitExpenseId]: {
          type: 'warning',
          text: 'Comprobante enviado. No pudimos actualizar el listado. Reintentá la actualización.',
        },
      }));
    } else {
      setFeedback((current) => ({ ...current, [unitExpenseId]: null }));
    }
    setSubmitting((current) => ({ ...current, [unitExpenseId]: false }));
  }

  function selectProof(unitExpenseId, file) {
    setFiles((current) => ({ ...current, [unitExpenseId]: file || null }));
    setFeedback((current) => ({ ...current, [unitExpenseId]: null }));
  }

  async function submitProof(event, unitExpense) {
    event.preventDefault();
    if (mpOperationsRef.current[unitExpense.id]) return;
    const file = files[unitExpense.id];
    const validation = validatePaymentProof(file);
    if (validation) {
      setFeedback((current) => ({
        ...current,
        [unitExpense.id]: { type: 'error', text: validation },
      }));
      return;
    }

    if (submitOperationsRef.current[unitExpense.id]) return;
    const operation = Symbol(`submit:${unitExpense.id}`);
    submitOperationsRef.current[unitExpense.id] = operation;
    setSubmitting((current) => ({ ...current, [unitExpense.id]: true }));
    setFeedback((current) => ({ ...current, [unitExpense.id]: null }));
    let committed;
    try {
      const { data } = await expenseService.submitPayment(unitExpense.id, file);
      committed = data;
    } catch (err) {
      if (mountedRef.current && submitOperationsRef.current[unitExpense.id] === operation) {
        setFeedback((current) => ({
          ...current,
          [unitExpense.id]: { type: 'error', text: getErrorMessage(err, 'No pudimos enviar el comprobante.') },
        }));
        delete submitOperationsRef.current[unitExpense.id];
        setSubmitting((current) => ({ ...current, [unitExpense.id]: false }));
      }
      return;
    }

    if (!mountedRef.current || submitOperationsRef.current[unitExpense.id] !== operation) return;
    setItems((current) => current.map((item) => (
      item.id === unitExpense.id ? { ...item, ...committed } : item
    )));
    setFiles((current) => ({ ...current, [unitExpense.id]: null }));
    setFeedback((current) => ({
      ...current,
      [unitExpense.id]: { type: 'success', text: 'Comprobante enviado. Quedó pendiente de revisión administrativa.' },
    }));
    setUnreconciled((current) => ({ ...current, [unitExpense.id]: true }));

    const refreshed = await load(false, false);
    if (mountedRef.current && submitOperationsRef.current[unitExpense.id] === operation && !refreshed) {
      setFeedback((current) => ({
        ...current,
        [unitExpense.id]: {
          type: 'warning',
          text: 'Comprobante enviado. No pudimos actualizar el listado. Reintentá la actualización.',
        },
      }));
    }

    if (mountedRef.current && submitOperationsRef.current[unitExpense.id] === operation) {
      delete submitOperationsRef.current[unitExpense.id];
      setSubmitting((current) => ({ ...current, [unitExpense.id]: false }));
    }
  }

  async function payWithMercadoPago(unitExpense) {
    if (!mercadoPagoAvailable
      || submitOperationsRef.current[unitExpense.id]
      || mpOperationsRef.current[unitExpense.id]) return;
    const operation = Symbol(`mp:${unitExpense.id}`);
    mpOperationsRef.current[unitExpense.id] = operation;
    setPayingWithMp((current) => ({ ...current, [unitExpense.id]: true }));
    setFeedback((current) => ({ ...current, [unitExpense.id]: null }));
    try {
      const { data } = await paymentService.createPreference(unitExpense.id);
      if (!mountedRef.current || mpOperationsRef.current[unitExpense.id] !== operation) return;
      const target = data?.sandbox_init_point || data?.init_point;
      if (!target) throw new Error('Mercado Pago no devolvió un destino de pago');
      window.open(target, '_blank');
    } catch (error) {
      if (mountedRef.current && mpOperationsRef.current[unitExpense.id] === operation) {
        setFeedback((current) => ({
          ...current,
          [unitExpense.id]: {
            type: 'error',
            text: getErrorMessage(error, 'No pudimos iniciar el pago con Mercado Pago.'),
          },
        }));
      }
    } finally {
      if (mountedRef.current && mpOperationsRef.current[unitExpense.id] === operation) {
        delete mpOperationsRef.current[unitExpense.id];
        setPayingWithMp((current) => ({ ...current, [unitExpense.id]: false }));
      }
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Mis expensas</h2>
      {loadError && (
        <div style={s.errorMsg}>
          <p role="alert" style={s.feedbackText}>{loadError}</p>
          <button type="button" onClick={() => load()} style={s.retryBtn}>Reintentar actualización</button>
        </div>
      )}
      {!loadError && items.length === 0 ? (
        <p style={s.empty}>No tenés expensas pendientes.</p>
      ) : !loadError && (
        items.map((u) => {
          const st = manualPaymentStatus(u.status);
          const actions = unreconciled[u.id]
            ? []
            : manualPaymentActions(u.status, 'residente', Boolean(u.payment_proof_url));
          const isSubmitting = Boolean(submitting[u.id]);
          const isPayingWithMp = Boolean(payingWithMp[u.id]);
          const isPaymentBusy = isSubmitting || isPayingWithMp;
          const rowFeedback = feedback[u.id];
          return (
            <div key={u.id} style={s.row}>
              <div style={s.rowContent}>
                <strong>{u.description}</strong>
                <p style={s.period}>{u.period && `Período: ${u.period}`} {parseFloat(u.extra_part) > 0 && '· Extraordinaria'}</p>
                <p style={s.breakdown}>
                  Cuota fija: ${(parseFloat(u.fixed_part) || 0).toLocaleString()} + Extra: ${(parseFloat(u.extra_part) || 0).toLocaleString()} = ${parseFloat(u.amount_owed).toLocaleString()}
                </p>
                <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>
                {u.status === 'in_review' && <p style={s.stateHelp}>Pendiente de revisión administrativa.</p>}
                {u.status === 'paid' && <p style={{ ...s.stateHelp, color: '#198754' }}>Pago aprobado.</p>}
                {u.status === 'rejected' && <p style={{ ...s.stateHelp, color: '#842029' }}>El comprobante fue rechazado. Podés enviar uno nuevo.</p>}
              </div>
              <div style={s.rowRight}>
                <span style={{ ...s.amount, color: u.is_overdue && u.late_fee > 0 ? '#dc3545' : '#2c3e50' }}>
                  ${parseFloat(u.total_with_fee || u.amount_owed).toLocaleString()}
                </span>
                {u.is_overdue && u.late_fee > 0 && (
                  <span style={s.lateFee} title={`Incluye $${u.late_fee.toLocaleString()} de interés por mora`}>
                    +${u.late_fee.toLocaleString()} recargo
                  </span>
                )}
                <span style={s.date}>Vence: {u.due_date ? new Date(u.due_date).toLocaleDateString('es-AR') : '-'}</span>
                {actions.includes('submit') && (
                  <form style={s.proofForm} onSubmit={(event) => submitProof(event, u)}>
                    <label htmlFor={`payment-proof-${u.id}`} style={s.proofLabel}>Comprobante de pago</label>
                    <input
                      id={`payment-proof-${u.id}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      required
                      disabled={isPaymentBusy}
                      onChange={(event) => selectProof(u.id, event.target.files?.[0])}
                      style={s.fileInput}
                    />
                    <span style={s.fileHelp}>PDF, JPG, JPEG o PNG · máximo 5 MiB.</span>
                    <button
                      type="submit"
                      disabled={isPaymentBusy}
                      style={{ ...s.actionBtn, ...s.submitProofBtn, opacity: isPaymentBusy ? 0.7 : 1 }}
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar comprobante'}
                    </button>
                  </form>
                )}
                {mercadoPagoAvailable && u.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isPaymentBusy}
                    style={{ ...s.secondaryBtn, marginTop: '0.5rem' }}
                    onClick={() => payWithMercadoPago(u)}
                  >
                    {isPayingWithMp ? 'Abriendo Mercado Pago...' : 'Pagar con MP'}
                  </button>
                )}
                {rowFeedback && (
                  <p role={rowFeedback.type === 'error' ? 'alert' : 'status'} style={rowFeedback.type === 'error' ? s.inlineError : rowFeedback.type === 'warning' ? s.inlineWarning : s.inlineSuccess}>
                    {rowFeedback.text}
                  </p>
                )}
                {rowFeedback?.type === 'warning' && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => retryReconciliation(u.id)}
                    style={s.retryBtn}
                  >
                    Reintentar actualización
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function AdminView() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailWarning, setDetailWarning] = useState('');
  const [busyRows, setBusyRows] = useState({});
  const [unreconciledRows, setUnreconciledRows] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const [editing, setEditing] = useState(false);
  const [busyEdits, setBusyEdits] = useState({});
  const [unreconciledExpenses, setUnreconciledExpenses] = useState({});
  const [editFeedback, setEditFeedback] = useState(null);
  const [editForm, setEditForm] = useState({
    description: '', fixedAmount: '', extraAmount: '', due_date: '', period: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const mountedRef = useRef(true);
  const listGenerationRef = useRef(0);
  const modalGenerationRef = useRef(0);
  const selectedExpenseIdRef = useRef(null);
  const busyRowsRef = useRef({});
  const busyEditsRef = useRef({});
  const unreconciledRowsRef = useRef({});
  const unreconciledExpensesRef = useRef({});
  const rowCommitVersionsRef = useRef({});
  const committedRowsRef = useRef({});
  const detailReadGenerationRef = useRef(0);
  const operationSequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listGenerationRef.current += 1;
      modalGenerationRef.current += 1;
      selectedExpenseIdRef.current = null;
      busyRowsRef.current = {};
      busyEditsRef.current = {};
      unreconciledRowsRef.current = {};
      unreconciledExpensesRef.current = {};
      rowCommitVersionsRef.current = {};
      committedRowsRef.current = {};
      detailReadGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => { loadExpenses(); }, [page]);

  function isCurrentDetail(expenseId, generation) {
    return mountedRef.current
      && selectedExpenseIdRef.current === expenseId
      && modalGenerationRef.current === generation;
  }

  function beginDetailRead() {
    return ++detailReadGenerationRef.current;
  }

  function isCurrentDetailRead(expenseId, modalGeneration, readGeneration) {
    return isCurrentDetail(expenseId, modalGeneration)
      && detailReadGenerationRef.current === readGeneration;
  }

  function updateUnreconciledRows(updater) {
    const next = updater(unreconciledRowsRef.current);
    unreconciledRowsRef.current = next;
    if (mountedRef.current) setUnreconciledRows(next);
  }

  function updateUnreconciledExpenses(updater) {
    const next = updater(unreconciledExpensesRef.current);
    unreconciledExpensesRef.current = next;
    if (mountedRef.current) setUnreconciledExpenses(next);
  }

  async function loadExpenses(showSpinner = true, publishError = true) {
    const generation = ++listGenerationRef.current;
    if (showSpinner) setLoading(true);
    if (publishError) setListError('');
    try {
      const { data } = await expenseService.listAll(page);
      if (!mountedRef.current || generation !== listGenerationRef.current) return false;
      const nextExpenses = data.data || [];
      setExpenses(nextExpenses);
      setTotalPages(data.totalPages || 1);
      setListError('');
      return nextExpenses;
    } catch (err) {
      if (!mountedRef.current || generation !== listGenerationRef.current) return false;
      if (publishError) setListError(getErrorMessage(err, 'Error al cargar expensas'));
      return false;
    } finally {
      if (showSpinner && mountedRef.current && generation === listGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  async function openDetail(expense) {
    const generation = ++modalGenerationRef.current;
    const readGeneration = beginDetailRead();
    const rowVersionsAtRequest = { ...rowCommitVersionsRef.current };
    selectedExpenseIdRef.current = expense.id;
    setSelectedExpense(expense);
    setUnits([]);
    setUnitsLoading(true);
    setModal(true);
    setMsg('');
    setDetailError('');
    setDetailWarning('');
    setActionErrors({});
    setEditing(false);
    setEditFeedback(null);
    try {
      const { data: raw } = await expenseService.getUnitExpenses(expense.id);
      if (!isCurrentDetailRead(expense.id, generation, readGeneration)) return;
      const nextUnits = raw.units || [];
      publishDetailRows(nextUnits, rowVersionsAtRequest);
    } catch (err) {
      if (!isCurrentDetailRead(expense.id, generation, readGeneration)) return;
      setUnits([]);
      setDetailError(getErrorMessage(err, 'Error al cargar detalle'));
    } finally {
      if (isCurrentDetailRead(expense.id, generation, readGeneration)) setUnitsLoading(false);
    }
  }

  function closeDetail() {
    modalGenerationRef.current += 1;
    selectedExpenseIdRef.current = null;
    setModal(false);
    setSelectedExpense(null);
    setUnits([]);
    setUnitsLoading(false);
    setDetailError('');
    setDetailWarning('');
    setEditing(false);
    setEditFeedback(null);
  }

  function beginRowOperation(unitExpenseId, action) {
    if (busyRowsRef.current[unitExpenseId] || unreconciledRowsRef.current[unitExpenseId]) return null;
    const operation = { id: ++operationSequenceRef.current, action };
    busyRowsRef.current = { ...busyRowsRef.current, [unitExpenseId]: operation };
    setBusyRows(busyRowsRef.current);
    return operation;
  }

  function finishRowOperation(unitExpenseId, operation) {
    if (busyRowsRef.current[unitExpenseId]?.id !== operation.id) return;
    const next = { ...busyRowsRef.current };
    delete next[unitExpenseId];
    busyRowsRef.current = next;
    if (mountedRef.current) setBusyRows(next);
  }

  function publishDetailRows(nextUnits, rowVersionsAtRequest) {
    setUnits(nextUnits.map((unit) => {
      const committedAfterRequest = rowCommitVersionsRef.current[unit.id] !== rowVersionsAtRequest[unit.id];
      return committedAfterRequest
        ? { ...unit, ...committedRowsRef.current[unit.id] }
        : unit;
    }));
  }

  async function reconcileCurrent(expense, generation, blockedUnitId = null, blockedVersion = null, requestedReadGeneration = null) {
    const readGeneration = requestedReadGeneration ?? beginDetailRead();
    const rowVersionsAtRequest = { ...rowCommitVersionsRef.current };
    const [detailResult, listResult] = await Promise.allSettled([
      expenseService.getUnitExpenses(expense.id),
      loadExpenses(false, false),
    ]);
    if (!isCurrentDetailRead(expense.id, generation, readGeneration)) return false;
    // The current read also owns loading inherited from an initial read or retry.
    setUnitsLoading(false);

    const detailSucceeded = detailResult.status === 'fulfilled';
    const refreshedExpense = listResult.status === 'fulfilled' && Array.isArray(listResult.value)
      ? listResult.value.find((item) => item.id === expense.id)
      : null;
    const listSucceeded = Boolean(refreshedExpense);
    if (detailSucceeded) {
      const nextUnits = detailResult.value.data.units || [];
      publishDetailRows(nextUnits, rowVersionsAtRequest);
      setDetailError('');
      updateUnreconciledRows((current) => {
        const next = { ...current };
        for (const unit of nextUnits) {
          if (rowCommitVersionsRef.current[unit.id] === rowVersionsAtRequest[unit.id]) {
            delete next[unit.id];
          }
        }
        if (blockedUnitId && rowCommitVersionsRef.current[blockedUnitId] === blockedVersion) {
          delete next[blockedUnitId];
        }
        return next;
      });
    }
    if (refreshedExpense) {
      setSelectedExpense((current) => (
        current?.id === expense.id ? { ...current, ...refreshedExpense } : current
      ));
    }
    if (detailSucceeded && listSucceeded) {
      setDetailWarning('');
      updateUnreconciledExpenses((current) => {
        const next = { ...current };
        delete next[expense.id];
        return next;
      });
      return true;
    }
    setDetailWarning('No pudimos actualizar los datos. La operación fue registrada; reintentá la actualización.');
    return false;
  }

  async function retryAdminReconciliation() {
    if (!selectedExpense) return;
    const expense = selectedExpense;
    const generation = modalGenerationRef.current;
    const readGeneration = beginDetailRead();
    setUnitsLoading(true);
    await reconcileCurrent(expense, generation, null, null, readGeneration);
  }

  function startEditing() {
    if (unitsLoading || busyEditsRef.current[selectedExpense.id] || unreconciledExpensesRef.current[selectedExpense.id]) return;
    setEditForm({
      description: selectedExpense.description || '',
      fixedAmount: String(selectedExpense.fixed_amount ?? ''),
      extraAmount: String(selectedExpense.extra_amount ?? ''),
      due_date: selectedExpense.due_date ? String(selectedExpense.due_date).slice(0, 10) : '',
      period: selectedExpense.period || '',
    });
    setEditFeedback(null);
    setEditing(true);
  }

  function changeEditField(event) {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  }

  async function submitEdit(event) {
    event.preventDefault();
    const expense = selectedExpense;
    const generation = modalGenerationRef.current;
    if (!expense || busyEditsRef.current[expense.id] || unreconciledExpensesRef.current[expense.id]) return;
    const operation = { id: ++operationSequenceRef.current };
    busyEditsRef.current = { ...busyEditsRef.current, [expense.id]: operation };
    setBusyEdits(busyEditsRef.current);
    setEditFeedback(null);
    let committed;
    try {
      const { data } = await expenseService.update(expense.id, editForm);
      committed = { ...expense, ...data };
    } catch (err) {
      if (isCurrentDetail(expense.id, generation)) {
        setEditFeedback({ type: 'error', text: getErrorMessage(err, 'No pudimos actualizar la expensa.') });
      }
      const nextBusy = { ...busyEditsRef.current };
      if (nextBusy[expense.id]?.id === operation.id) delete nextBusy[expense.id];
      busyEditsRef.current = nextBusy;
      if (mountedRef.current) setBusyEdits(nextBusy);
      return;
    }

    if (!mountedRef.current) return;
    setExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, ...committed } : item));
    updateUnreconciledExpenses((current) => ({ ...current, [expense.id]: true }));
    if (isCurrentDetail(expense.id, generation)) {
      setSelectedExpense(committed);
      setEditing(false);
      setEditFeedback({ type: 'success', text: 'Expensa actualizada. Los comprobantes y estados se conservaron.' });
      await reconcileCurrent(committed, generation);
    }

    const nextBusy = { ...busyEditsRef.current };
    if (nextBusy[expense.id]?.id === operation.id) delete nextBusy[expense.id];
    busyEditsRef.current = nextBusy;
    if (mountedRef.current) setBusyEdits(nextBusy);
  }

  async function handleReview(unitExpense, action) {
    const expense = selectedExpense;
    const generation = modalGenerationRef.current;
    if (!expense || selectedExpenseIdRef.current !== expense.id) return;
    const operation = beginRowOperation(unitExpense.id, action);
    if (!operation) return;
    setMsg('');
    setActionErrors((current) => ({ ...current, [unitExpense.id]: '' }));
    let committed;
    try {
      if (action === 'approve') {
        const { data } = await expenseService.confirmPayment(unitExpense.id);
        committed = data;
      } else {
        const { data } = await expenseService.rejectPayment(unitExpense.id);
        committed = data;
      }
    } catch (err) {
      if (isCurrentDetail(expense.id, generation)) {
        setActionErrors((current) => ({
          ...current,
          [unitExpense.id]: getErrorMessage(err, action === 'approve' ? 'Error al aprobar el pago' : 'Error al rechazar el pago'),
        }));
      }
      finishRowOperation(unitExpense.id, operation);
      return;
    }

    if (!mountedRef.current) return;
    const committedRow = { ...unitExpense, ...committed };
    rowCommitVersionsRef.current = {
      ...rowCommitVersionsRef.current,
      [unitExpense.id]: operation.id,
    };
    committedRowsRef.current = {
      ...committedRowsRef.current,
      [unitExpense.id]: committedRow,
    };
    updateUnreconciledRows((current) => ({ ...current, [unitExpense.id]: true }));
    if (isCurrentDetail(expense.id, generation)) {
      setUnits((current) => current.map((unit) => (
        unit.id === unitExpense.id ? committedRow : unit
      )));
      setMsg(action === 'approve'
        ? 'Pago aprobado.'
        : 'Comprobante rechazado. El residente puede enviar uno nuevo.');
      await reconcileCurrent(expense, generation, unitExpense.id, operation.id);
    }
    finishRowOperation(unitExpense.id, operation);
  }

  async function handleDownload(unitExpense) {
    const expense = selectedExpense;
    const generation = modalGenerationRef.current;
    if (!expense || selectedExpenseIdRef.current !== expense.id) return;
    const operation = beginRowOperation(unitExpense.id, 'download');
    if (!operation) return;
    setActionErrors((current) => ({ ...current, [unitExpense.id]: '' }));
    try {
      const extension = /\.[A-Za-z0-9]+$/.exec(unitExpense.payment_proof_url)?.[0] || '';
      await downloadProtectedUpload(
        unitExpense.payment_proof_url,
        `comprobante-expensa-${unitExpense.id}${extension}`
      );
    } catch (err) {
      if (isCurrentDetail(expense.id, generation)) {
        setActionErrors((current) => ({
          ...current,
          [unitExpense.id]: getErrorMessage(err, 'No pudimos descargar el comprobante.'),
        }));
      }
    } finally {
      finishRowOperation(unitExpense.id, operation);
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;
  const hasUnreconciledDetail = Boolean(
    selectedExpense
    && (unreconciledExpenses[selectedExpense.id]
      || units.some((unit) => unreconciledRows[unit.id]))
  );

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Expensas</h2>
      <CreateExpensa onCreated={loadExpenses} />
      {msg && <p style={s.msg}>{msg}</p>}
      {listError && (
        <div style={s.errorMsg}>
          <p role="alert" style={s.feedbackText}>{listError}</p>
          <button type="button" onClick={() => loadExpenses()} style={s.retryBtn}>Reintentar actualización</button>
        </div>
      )}
      {!listError && expenses.length === 0 ? (
        <p style={s.empty}>No hay expensas aún.</p>
      ) : !listError && (
        expenses.map((e) => (
          <div key={e.id} style={s.row} onClick={() => openDetail(e)}>
            <div>
              <strong>{e.description}</strong>
              <p style={s.period}>
                {e.period && `Período: ${e.period}`}
                {parseFloat(e.extra_amount) > 0 && ' · Extraordinaria'}
              </p>
              <p style={s.breakdown}>
                Fijo: ${(parseFloat(e.fixed_amount) || 0).toLocaleString()} + Extra: ${(parseFloat(e.extra_amount) || 0).toLocaleString()}
              </p>
            </div>
            <div style={s.rowRight}>
              <span style={s.amount}>${parseFloat(e.amount).toLocaleString()}</span>
              <span style={s.date}>Vence: {new Date(e.due_date).toLocaleDateString('es-AR')}</span>
            </div>
          </div>
        ))
      )}

      {totalPages > 1 && (
        <div style={s.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={s.pageBtn}>Anterior</button>
          <span style={s.pageInfo}>Pág. {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={s.pageBtn}>Siguiente</button>
        </div>
      )}

      {modal && selectedExpense && (
        <div style={s.overlay} onClick={closeDetail}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{selectedExpense.description}</h3>
            <p style={s.modalInfo}>
              Fijo: ${(parseFloat(selectedExpense.fixed_amount) || 0).toLocaleString()} + Extra: ${(parseFloat(selectedExpense.extra_amount) || 0).toLocaleString()} = ${parseFloat(selectedExpense.amount).toLocaleString()} | Vence: {new Date(selectedExpense.due_date).toLocaleDateString('es-AR')}
            </p>
            {!editing && (
              <button
                type="button"
                disabled={Boolean(unitsLoading || busyEdits[selectedExpense.id] || unreconciledExpenses[selectedExpense.id])}
                onClick={startEditing}
                style={{ ...s.editBtn, opacity: unitsLoading || busyEdits[selectedExpense.id] || unreconciledExpenses[selectedExpense.id] ? 0.7 : 1 }}
              >
                {busyEdits[selectedExpense.id] ? 'Guardando...' : 'Editar expensa'}
              </button>
            )}
            {editing && (
              <form id="edit-expense-form" onSubmit={submitEdit} style={s.editForm}>
                <label style={s.editLabel}>
                  Descripción
                  <input name="description" value={editForm.description} onChange={changeEditField} required style={s.editInput} />
                </label>
                <div style={s.editRow}>
                  <label style={s.editLabel}>
                    Monto fijo
                    <input name="fixedAmount" type="number" min="0" step="0.01" value={editForm.fixedAmount} onChange={changeEditField} style={s.editInput} />
                  </label>
                  <label style={s.editLabel}>
                    Monto extraordinario
                    <input name="extraAmount" type="number" min="0" step="0.01" value={editForm.extraAmount} onChange={changeEditField} style={s.editInput} />
                  </label>
                </div>
                <div style={s.editRow}>
                  <label style={s.editLabel}>
                    Vencimiento
                    <input name="due_date" type="date" value={editForm.due_date} onChange={changeEditField} required style={s.editInput} />
                  </label>
                  <label style={s.editLabel}>
                    Período
                    <input name="period" value={editForm.period} onChange={changeEditField} style={s.editInput} />
                  </label>
                </div>
                <div style={s.actionGroup}>
                  <button type="submit" disabled={Boolean(busyEdits[selectedExpense.id])} style={{ ...s.actionBtn, background: '#0d6efd' }}>
                    {busyEdits[selectedExpense.id] ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button type="button" disabled={Boolean(busyEdits[selectedExpense.id])} onClick={() => setEditing(false)} style={s.secondaryBtn}>Cancelar</button>
                </div>
              </form>
            )}
            {editFeedback && (
              <p role={editFeedback.type === 'error' ? 'alert' : 'status'} style={editFeedback.type === 'error' ? s.errorMsg : s.msg}>
                {editFeedback.text}
              </p>
            )}
            {detailError && <p role="alert" style={s.errorMsg}>{detailError}</p>}
            {(detailWarning || hasUnreconciledDetail) && (
              <div style={s.warningMsg}>
                <p role="status" style={s.feedbackText}>
                  {detailWarning || 'La operación fue registrada y está pendiente de conciliación.'}
                </p>
                <button type="button" onClick={retryAdminReconciliation} style={s.retryBtn}>Reintentar actualización</button>
              </div>
            )}
            {unitsLoading ? <Spinner /> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Comprobante</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const st = manualPaymentStatus(u.status);
                      const hasProof = Boolean(u.payment_proof_url);
                      const actions = manualPaymentActions(u.status, 'admin', hasProof);
                      const activeOperation = busyRows[u.id];
                      const rowBlocked = Boolean(unreconciledRows[u.id]);
                      const rowBusy = Boolean(activeOperation) || rowBlocked;
                      return (
                        <tr key={u.id}>
                          <td>{u.unit_number}</td>
                          <td>${parseFloat(u.amount_owed).toLocaleString()}</td>
                          <td><span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span></td>
                          <td>
                            {hasProof && (
                              <button
                                type="button"
                                disabled={rowBusy}
                                style={{ ...s.secondaryBtn, opacity: rowBusy ? 0.7 : 1 }}
                                onClick={() => handleDownload(u)}
                              >
                                {activeOperation?.action === 'download' ? 'Descargando...' : 'Descargar comprobante'}
                              </button>
                            )}
                            {!hasProof && u.status === 'in_review' && (
                              <span style={s.recoveryHelp}>Envío histórico incompleto.</span>
                            )}
                          </td>
                          <td>
                            <div style={s.actionGroup}>
                              {actions.includes('approve') && (
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  style={{ ...s.actionBtn, background: '#198754', opacity: rowBusy ? 0.7 : 1 }}
                                  onClick={() => handleReview(u, 'approve')}
                                >
                                  {activeOperation?.action === 'approve' ? 'Aprobando...' : 'Aprobar'}
                                </button>
                              )}
                              {actions.includes('reject') && (
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  style={{ ...s.actionBtn, background: '#dc3545', opacity: rowBusy ? 0.7 : 1 }}
                                  onClick={() => handleReview(u, 'reject')}
                                >
                                  {activeOperation?.action === 'reject' ? 'Rechazando...' : 'Rechazar'}
                                </button>
                              )}
                              {u.status === 'paid' && <span style={{ color: '#198754', fontSize: '0.8rem' }}>Aprobado</span>}
                            </div>
                            {rowBlocked && <p role="status" style={s.inlineWarning}>Actualización pendiente de conciliación.</p>}
                            {actionErrors[u.id] && <p role="alert" style={s.inlineError}>{actionErrors[u.id]}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button style={s.closeBtn} onClick={closeDetail}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Expensas() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminView /> : <ResidentView />;
}

const s = {
  container: { padding: '1.5rem', maxWidth: '800px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  empty: { color: '#6c757d', textAlign: 'center', padding: '2rem' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.875rem' },
  errorMsg: { background: '#f8d7da', color: '#842029', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.875rem' },
  warningMsg: { background: '#fff3cd', color: '#664d03', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.875rem' },
  feedbackText: { margin: '0 0 0.4rem' },
  row: {
    background: '#fff', padding: '1rem 1.25rem', borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem',
    display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', cursor: 'pointer',
  },
  rowContent: { minWidth: 0, flex: '1 1 260px' },
  rowRight: { textAlign: 'right', minWidth: 0, flex: '1 1 240px' },
  amount: { fontSize: '1.1rem', fontWeight: 700, color: '#2c3e50', display: 'block' },
  date: { fontSize: '0.8rem', color: '#6c757d' },
  period: { fontSize: '0.8rem', color: '#6c757d', marginTop: '0.15rem' },
  breakdown: { fontSize: '0.75rem', color: '#6c757d', marginTop: '0.1rem' },
  lateFee: { fontSize: '0.75rem', color: '#dc3545', fontWeight: 600, cursor: 'help', marginTop: '0.15rem', display: 'block' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#fff', padding: '1.5rem', borderRadius: '8px',
    maxWidth: '650px', width: '95%', maxHeight: '80vh', overflowY: 'auto',
  },
  modalInfo: { fontSize: '0.9rem', color: '#6c757d', marginBottom: '1rem' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.5rem' },
  table: { width: '100%', minWidth: '720px', borderCollapse: 'collapse', marginBottom: '0.5rem' },
  badge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
  smallBtn: {
    padding: '0.5rem 0.85rem', background: '#0d6efd', color: '#fff',
    border: 'none', borderRadius: '4px', fontSize: '0.85rem', cursor: 'pointer', minHeight: '44px',
  },
  actionBtn: {
    padding: '0.5rem 0.85rem', color: '#fff', border: 'none', borderRadius: '4px',
    fontSize: '0.85rem', cursor: 'pointer', minHeight: '44px', whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    padding: '0.45rem 0.7rem', color: '#0d6efd', background: '#fff', border: '1px solid #0d6efd',
    borderRadius: '4px', fontSize: '0.78rem', cursor: 'pointer', minHeight: '44px', whiteSpace: 'nowrap',
  },
  actionGroup: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' },
  proofForm: { marginTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' },
  proofLabel: { fontSize: '0.78rem', color: '#495057', fontWeight: 600, textAlign: 'left' },
  fileInput: { width: '100%', maxWidth: '280px', fontSize: '0.78rem' },
  fileHelp: { fontSize: '0.72rem', color: '#6c757d', textAlign: 'left' },
  submitProofBtn: { background: '#0d6efd', marginTop: '0.2rem', width: '100%' },
  stateHelp: { margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#6c757d' },
  recoveryHelp: { color: '#842029', fontSize: '0.75rem' },
  inlineError: { color: '#842029', fontSize: '0.75rem', margin: '0.35rem 0 0' },
  inlineWarning: { color: '#664d03', fontSize: '0.75rem', margin: '0.35rem 0 0' },
  inlineSuccess: { color: '#0f5132', fontSize: '0.75rem', margin: '0.35rem 0 0' },
  retryBtn: {
    padding: '0.4rem 0.7rem', color: '#0d6efd', background: '#fff', border: '1px solid #0d6efd',
    borderRadius: '4px', cursor: 'pointer', minHeight: '40px', fontSize: '0.78rem',
  },
  editBtn: {
    padding: '0.45rem 0.8rem', color: '#0d6efd', background: '#fff', border: '1px solid #0d6efd',
    borderRadius: '4px', cursor: 'pointer', minHeight: '44px', marginBottom: '0.75rem',
  },
  editForm: { background: '#f8f9fa', borderRadius: '6px', padding: '0.85rem', marginBottom: '0.75rem' },
  editRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  editLabel: { display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: '1 1 180px', color: '#495057', fontSize: '0.78rem', fontWeight: 600 },
  editInput: { padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.6rem' },
  closeBtn: {
    padding: '0.6rem 1.5rem', background: '#6c757d', color: '#fff', border: 'none',
    borderRadius: '4px', cursor: 'pointer', minHeight: '44px', fontSize: '0.9rem',
  },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: { padding: '0.4rem 1rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' },
  pageInfo: { fontSize: '0.85rem', color: '#6c757d' },
};
