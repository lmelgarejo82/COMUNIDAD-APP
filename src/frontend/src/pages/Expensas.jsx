import { useState, useEffect } from 'react';
import { expenseService } from '../services/expensas';
import { paymentService } from '../services/payments';
import { useAuth } from '../context/AuthContext';
import CreateExpensa from './CreateExpensa';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';

const STATUS_MAP = {
  pending: { label: 'Pendiente', color: '#dc3545', bg: '#f8d7da' },
  in_review: { label: 'En revisión', color: '#fd7e14', bg: '#fff3cd' },
  paid: { label: 'Pagado', color: '#198754', bg: '#d1e7dd' },
};

function ResidentView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await expenseService.listMy();
      setItems(data);
    } catch {
      setMsg(getErrorMessage(err, 'Error al cargar expensas'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(unitExpense) {
    setMsg('');
    try {
      const { data } = await paymentService.createPreference(unitExpense.id);
      if (data.sandbox_init_point || data.init_point) {
        window.open(data.sandbox_init_point || data.init_point, '_blank');
        setMsg('Redirigiendo a MercadoPago...');
        setTimeout(() => load(), 3000);
      }
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al generar el pago'));
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Mis expensas</h2>
      {msg && <p style={s.msg}>{msg}</p>}
      {items.length === 0 ? (
        <p style={s.empty}>No tenés expensas pendientes.</p>
      ) : (
        items.map((u) => {
          const st = STATUS_MAP[u.status];
          return (
            <div key={u.id} style={s.row}>
              <div>
                <strong>{u.description}</strong>
                <p style={s.period}>{u.period && `Período: ${u.period}`} {parseFloat(u.extra_part) > 0 && '· Extraordinaria'}</p>
                <p style={s.breakdown}>
                  Cuota fija: ${(parseFloat(u.fixed_part) || 0).toLocaleString()} + Extra: ${(parseFloat(u.extra_part) || 0).toLocaleString()} = ${parseFloat(u.amount_owed).toLocaleString()}
                </p>
                <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>
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
                {u.status === 'pending' && (
                  <button style={{ ...s.actionBtn, background: '#009EE3', marginTop: '0.5rem' }} onClick={() => handlePay(u)}>Pagar con MP</button>
                )}
                {u.status === 'in_review' && (
                  <span style={{ fontSize: '0.8rem', color: '#fd7e14', marginTop: '0.5rem' }}>En revisión</span>
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { loadExpenses(); }, [page]);

  async function loadExpenses() {
    setLoading(true);
    try {
      const { data } = await expenseService.listAll(page);
      setExpenses(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al cargar expensas'));
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(expense) {
    setSelectedExpense(expense);
    setUnitsLoading(true);
    setModal(true);
    setMsg('');
    try {
      const { data: raw } = await expenseService.getUnitExpenses(expense.id);
      setUnits(raw.units);
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al cargar detalle'));
    } finally {
      setUnitsLoading(false);
    }
  }

  async function handleConfirm(unitExpense) {
    setMsg('');
    try {
      await expenseService.confirmPayment(unitExpense.id);
      setMsg('Pago confirmado.');
      openDetail(selectedExpense);
      loadExpenses();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al confirmar'));
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
            {unitsLoading ? <Spinner /> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Confirmar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const st = STATUS_MAP[u.status];
                      return (
                        <tr key={u.id}>
                          <td>{u.unit_number}</td>
                          <td>${parseFloat(u.amount_owed).toLocaleString()}</td>
                          <td><span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span></td>
                          <td>
                            {u.status === 'in_review' && (
                              <button style={{ ...s.actionBtn, background: '#198754' }} onClick={() => handleConfirm(u)}>Confirmar</button>
                            )}
                            {u.status === 'paid' && <span style={{ color: '#198754', fontSize: '0.8rem' }}>Confirmado</span>}
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
  row: {
    background: '#fff', padding: '1rem 1.25rem', borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
  },
  rowRight: { textAlign: 'right' },
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
  table: { width: '100%', minWidth: '500px', borderCollapse: 'collapse', marginBottom: '0.5rem' },
  badge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
  smallBtn: {
    padding: '0.5rem 0.85rem', background: '#0d6efd', color: '#fff',
    border: 'none', borderRadius: '4px', fontSize: '0.85rem', cursor: 'pointer', minHeight: '44px',
  },
  actionBtn: {
    padding: '0.5rem 0.85rem', color: '#fff', border: 'none', borderRadius: '4px',
    fontSize: '0.85rem', cursor: 'pointer', minHeight: '44px', whiteSpace: 'nowrap',
  },
  closeBtn: {
    padding: '0.6rem 1.5rem', background: '#6c757d', color: '#fff', border: 'none',
    borderRadius: '4px', cursor: 'pointer', minHeight: '44px', fontSize: '0.9rem',
  },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: { padding: '0.4rem 1rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' },
  pageInfo: { fontSize: '0.85rem', color: '#6c757d' },
};
