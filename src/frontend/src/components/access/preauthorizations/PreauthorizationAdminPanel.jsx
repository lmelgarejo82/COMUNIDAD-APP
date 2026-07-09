import t from '../../../theme';
import PreauthorizationDetailModal from './PreauthorizationDetailModal';
import PreauthorizationFilters from './PreauthorizationFilters';
import PreauthorizationForm from './PreauthorizationForm';
import PreauthorizationList from './PreauthorizationList';

export default function PreauthorizationAdminPanel({
  items,
  loading,
  saving,
  filters,
  form,
  detail,
  onRefresh,
  onFilterChange,
  onFormChange,
  onFormReset,
  onCreate,
  onCancel,
  onDetail,
  onCloseDetail,
}) {
  return (
    <section style={styles.preauthAdmin}>
      <div style={styles.preauthHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Preautorizaciones</h2>
          <span style={t.font.subtitle}>Visitas esperadas para encontrar rápido en portería.</span>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} style={t.secondaryBtn}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div style={styles.preauthLayout}>
        <PreauthorizationForm
          form={form}
          saving={saving}
          onChange={onFormChange}
          onReset={onFormReset}
          onSubmit={onCreate}
        />

        <div style={styles.preauthManage}>
          <div style={styles.listHeader}>
            <h3 style={styles.subsectionTitle}>Seguimiento</h3>
            <span style={styles.countBadge}>{items.length} registros</span>
          </div>
          <PreauthorizationFilters filters={filters} onChange={onFilterChange} />
          <PreauthorizationList
            items={items}
            loading={loading}
            saving={saving}
            onCancel={onCancel}
            onDetail={onDetail}
          />
        </div>
      </div>

      <PreauthorizationDetailModal
        item={detail}
        saving={saving}
        onClose={onCloseDetail}
        onCancel={onCancel}
      />
    </section>
  );
}

const styles = {
  preauthAdmin: { ...t.card, padding: '0.9rem', marginBottom: '0.75rem', display: 'grid', gap: '0.7rem' },
  preauthHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' },
  sectionTitle: { ...t.sectionTitle, margin: 0 },
  subsectionTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 700, color: t.colors.textPrimary },
  preauthLayout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', alignItems: 'start' },
  preauthManage: { display: 'grid', gap: '0.6rem' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  countBadge: { ...t.badge(t.colors.textSecondary, t.colors.border), whiteSpace: 'nowrap' },
};
