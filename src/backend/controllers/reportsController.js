const ExcelJS = require('exceljs');
const { Report } = require('../models/Report');

exports.delinquency = async (req, res) => {
  try {
    const { month } = req.query;
    const rows = await Report.delinquency(req.communityId, month);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Morosidad');

    sheet.columns = [
      { header: 'Unidad', key: 'unit', width: 12 },
      { header: 'Propietario', key: 'email', width: 30 },
      { header: 'Total Adeudado', key: 'amount', width: 16 },
      { header: 'Días de Mora', key: 'days', width: 14 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
    headerRow.alignment = { horizontal: 'center' };

    const now = new Date();

    rows.forEach((r) => {
      const dueDate = new Date(r.due_date);
      const graceDays = parseInt(r.grace_days) || 5;
      const graceEnd = new Date(dueDate);
      graceEnd.setDate(graceEnd.getDate() + graceDays);
      const daysOverdue = Math.max(0, Math.floor((now - graceEnd) / (1000 * 60 * 60 * 24)));
      const isOverdue = now > graceEnd;

      sheet.addRow({
        unit: r.unit_number,
        email: r.email,
        amount: parseFloat(r.amount_owed),
        days: daysOverdue,
        status: isOverdue ? 'Vencido' : 'Pendiente',
      });
    });

    sheet.getColumn('amount').numFmt = '$#,##0.00';
    sheet.getColumn('days').alignment = { horizontal: 'center' };
    sheet.getColumn('status').alignment = { horizontal: 'center' };

    // Colores condicionales
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const statusCell = row.getCell('status');
        if (statusCell.value === 'Vencido') {
          statusCell.font = { color: { argb: 'FFDC3545' }, bold: true };
          row.getCell('amount').font = { color: { argb: 'FFDC3545' } };
        }
      }
    });

    const filename = `morosidad-${month || 'total'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error en report delinquency:', err);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

exports.cashflow = async (req, res) => {
  try {
    const { month } = req.query;
    const data = await Report.cashflow(req.communityId, month);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Flujo de Caja');

    const titleRow = sheet.addRow([`Flujo de Caja — ${month || 'Total'}`]);
    titleRow.font = { bold: true, size: 14 };
    sheet.mergeCells('A1:D1');
    sheet.addRow([]);

    // Ingresos
    sheet.addRow(['INGRESOS', '', '', '']).font = { bold: true, color: { argb: 'FF198754' } };
    sheet.addRow(['Categoría', 'Monto']).font = { bold: true };
    let totalIncome = 0;
    data.income.forEach((item) => {
      sheet.addRow([item.category, item.amount]);
      totalIncome += item.amount;
    });
    sheet.addRow(['Total Ingresos', totalIncome]).font = { bold: true };
    sheet.addRow([]);

    // Gastos
    sheet.addRow(['GASTOS EMITIDOS', '', '', '']).font = { bold: true, color: { argb: 'FFDC3545' } };
    sheet.addRow(['Categoría', 'Monto']).font = { bold: true };
    let totalExpenses = 0;
    data.expenses.forEach((item) => {
      sheet.addRow([item.category, item.amount]);
      totalExpenses += item.amount;
    });
    sheet.addRow(['Total Gastos', totalExpenses]).font = { bold: true };
    sheet.addRow([]);

    // Resultado
    const balance = totalIncome - totalExpenses;
    sheet.addRow(['RESULTADO NETO', balance]).font = { bold: true, color: { argb: balance >= 0 ? 'FF198754' : 'FFDC3545' } };
    sheet.addRow([]);

    // Pendiente
    sheet.addRow(['Por cobrar (pendiente)', data.pending]).font = { bold: true, color: { argb: 'FFFD7E14' } };

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 18;
    sheet.getColumn('B').numFmt = '$#,##0.00';

    const filename = `flujo-caja-${month || 'total'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error en report cashflow:', err);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};
