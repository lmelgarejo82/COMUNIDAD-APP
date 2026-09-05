import { useState, useEffect } from 'react';
import { expenseService } from '../services/expensas';
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

  useEffect(() => { load(); }, []);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setLoadError('');
    try {
      const { data } = await expenseService.listMy();
      setItems(data);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Error al cargar expensas'));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  function selectProof(unitExpenseId, file) {
    setFiles((current) => ({ ...current, [unitExpenseId]: file || null }));
    setFeedback((current) => ({ ...current, [unitExpenseId]: null }));
  }

  async function submitProof(event, unitExpense) {
    event.preventDefault();
    const file = files[unitExpense.id];
    const validation = validatePaymentProof(file);
    if (validation) {
      setFeedback((current) => ({
        ...current,
        [unitExpense.id]: { type: 'error', text: validation },
      }));
      return;
    }

    setSubmitting((current) => ({ ...current, [unitExpense.id]: true }));
    setFeedback((current) => ({ ...current, [unitExpense.id]: null }));
    try {
      await expenseService.submitPayment(unitExpense.id, file);
      setFiles((current) => ({ ...current, [unitExpense.id]: null }));
      setFeedback((current) => ({
        ...current,
        [unitExpense.id]: { type: 'success', text: 'Comprobante enviado. Quedó pendiente de revisión administrativa.' },
      }));
      await load(false);
    } catch (err) {
      setFeedback((current) => ({
        ...current,
        [unitExpense.id]: { type: 'error', text: getErrorMessage(err, 'No pudimos enviar el comprobante.') },
      }));
    } finally {
      setSubmitting((current) => ({ ...current, [unitExpense.id]: false }));
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Mis expensas</h2>
      {loadError && <p role="alert" style={s.errorMsg}>{loadError}</p>}
      {items.length === 0 ? (
        <p style={s.empty}>No tenés expensas pendientes.</p>
      ) : (
        items.map((u) => {
          const st = manualPaymentStatus(u.status);
          const actions = manualPaymentActions(u.status, 'residente', Boolean(u.payment_proof_url));
          const isSubmitting = Boolean(submitting[u.id]);
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
                      disabled={isSubmitting}
                      onChange={(event) => selectProof(u.id, event.target.files?.[0])}
                      style={s.fileInput}
                    />
                    <span style={s.fileHelp}>PDF, JPG, JPEG o PNG · máximo 5 MiB.</span>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={{ ...s.actionBtn, ...s.submitProofBtn, opacity: isSubmitting ? 0.7 : 1 }}
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar comprobante'}
                    </button>
                  </form>
                )}
                {rowFeedback && (
                  <p role={rowFeedback.type === 'error' ? 'alert' : 'status'} style={rowFeedback.type === 'error' ? s.inlineError : s.inlineSuccess}>
                    {rowFeedback.text}
                  </p>
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
  const [detailError, setDetailError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionErrors, setActionErrors] = useState({});
  const [editing, setEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editFeedback, setEditFeedback] = useState(null);
  const [editForm, setEditForm] = useState({
    description: '', fixedAmount: '', extraAmount: '', due_date: '', period: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { loadExpenses(); }, [page]);

  async function loadExpenses(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const { data } = await expenseService.listAll(page);
      setExpenses(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al cargar expensas'));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function loadUnitDetail(expense) {
    const { data: raw } = await expenseService.getUnitExpenses(expense.id);
    setUnits(raw.units || []);
  }

  async function openDetail(expense) {
    setSelectedExpense(expense);
    setUnitsLoading(true);
    setModal(true);
    setMsg('');
    setDetailError('');
    setActionErrors({});
    setEditing(false);
    setEditFeedback(null);
    try {
      await loadUnitDetail(expense);
    } catch (err) {
      setDetailError(getErrorMessage(err, 'Error al cargar detalle'));
    } finally {
      setUnitsLoading(false);
    }
  }

  function startEditing() {
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
    setEditLoading(true);
    setEditFeedback(null);
    try {
      const { data } = await expenseService.update(selectedExpense.id, editForm);
      const updatedExpense = { ...selectedExpense, ...data };
      setSelectedExpense(updatedExpense);
      setEditing(false);
      setEditFeedback({ type: 'success', text: 'Expensa actualizada. Los comprobantes y estados se conservaron.' });
      await Promise.all([loadExpenses(false), loadUnitDetail(updatedExpense)]);
    } catch (err) {
      setEditFeedback({ type: 'error', text: getErrorMessage(err, 'No pudimos actualizar la expensa.') });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleReview(unitExpense, action) {
    const actionKey = `${unitExpense.id}:${action}`;
    setMsg('');
    setActionLoading(actionKey);
    setActionErrors((current) => ({ ...current, [unitExpense.id]: '' }));
    try {
      if (action === 'approve') {
        await expenseService.confirmPayment(unitExpense.id);
        setMsg('Pago aprobado.');
      } else {
        await expenseService.rejectPayment(unitExpense.id);
        setMsg('Comprobante rechazado. El residente puede enviar uno nuevo.');
      }
      await Promise.all([loadUnitDetail(selectedExpense), loadExpenses(false)]);
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [unitExpense.id]: getErrorMessage(err, action === 'approve' ? 'Error al aprobar el pago' : 'Error al rechazar el pago'),
      }));
    } finally {
      setActionLoading('');
    }
  }

  async function handleDownload(unitExpense) {
    const actionKey = `${unitExpense.id}:download`;
    setActionLoading(actionKey);
    setActionErrors((current) => ({ ...current, [unitExpense.id]: '' }));
    try {
      const extension = /\.[A-Za-z0-9]+$/.exec(unitExpense.payment_proof_url)?.[0] || '';
      await downloadProtectedUpload(
        unitExpense.payment_proof_url,
        `comprobante-expensa-${unitExpense.id}${extension}`
      );
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [unitExpense.id]: getErrorMessage(err, 'No pudimos descargar el comprobante.'),
      }));
    } finally {
      setActionLoading('');
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Expensas</h2>
      <CreateExpensa onCreated={loadExpenses} />
      {msg && <p style={s.msg}>{msg}</p>}
      {expenses.length === 0 ? (
        <p style={s.empty}>No hay expensas aún.</p>
      ) : (
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
        <div style={s.overlay} onClick={() => setModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{selectedExpense.description}</h3>
            <p style={s.modalInfo}>
              Fijo: ${(parseFloat(selectedExpense.fixed_amount) || 0).toLocaleString()} + Extra: ${(parseFloat(selectedExpense.extra_amount) || 0).toLocaleString()} = ${parseFloat(selectedExpense.amount).toLocaleString()} | Vence: {new Date(selectedExpense.due_date).toLocaleDateString('es-AR')}
            </p>
            {!editing && (
              <button type="button" onClick={startEditing} style={s.editBtn}>Editar expensa</button>
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
                  <button type="submit" disabled={editLoading} style={{ ...s.actionBtn, background: '#0d6efd' }}>
                    {editLoading ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button type="button" disabled={editLoading} onClick={() => setEditing(false)} style={s.secondaryBtn}>Cancelar</button>
                </div>
              </form>
            )}
            {editFeedback && (
              <p role={editFeedback.type === 'error' ? 'alert' : 'status'} style={editFeedback.type === 'error' ? s.errorMsg : s.msg}>
                {editFeedback.text}
              </p>
            )}
            {detailError && <p role="alert" style={s.errorMsg}>{detailError}</p>}
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
                      const rowBusy = actionLoading.startsWith(`${u.id}:`);
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
                                {actionLoading === `${u.id}:download` ? 'Descargando...' : 'Descargar comprobante'}
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
                                  {actionLoading === `${u.id}:approve` ? 'Aprobando...' : 'Aprobar'}
                                </button>
                              )}
                              {actions.includes('reject') && (
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  style={{ ...s.actionBtn, background: '#dc3545', opacity: rowBusy ? 0.7 : 1 }}
                                  onClick={() => handleReview(u, 'reject')}
                                >
                                  {actionLoading === `${u.id}:reject` ? 'Rechazando...' : 'Rechazar'}
                                </button>
                              )}
                              {u.status === 'paid' && <span style={{ color: '#198754', fontSize: '0.8rem' }}>Aprobado</span>}
                            </div>
                            {actionErrors[u.id] && <p role="alert" style={s.inlineError}>{actionErrors[u.id]}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button style={s.closeBtn} onClick={() => setModal(false)}>Cerrar</button>
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
  inlineSuccess: { color: '#0f5132', fontSize: '0.75rem', margin: '0.35rem 0 0' },
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
