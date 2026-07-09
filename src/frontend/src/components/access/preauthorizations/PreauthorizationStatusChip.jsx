import t from '../../../theme';
import { statusColors, statusLabels } from './preauthorizationUtils';

export default function PreauthorizationStatusChip({ status }) {
  const normalized = status || 'pending';
  const palette = statusColors[normalized] || statusColors.pending;
  return (
    <span style={t.badge(palette.color, palette.bg)}>
      {statusLabels[normalized] || normalized}
    </span>
  );
}
