require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { globalLimiter } = require('./middleware/rateLimiter');
const { uploadsAuth } = require('./middleware/uploadsAuth');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const expenseRoutes = require('./routes/expenses');
const hierarchyRoutes = require('./routes/hierarchy');
const masterTicketsRoutes = require('./routes/masterTickets');
const announcementRoutes = require('./routes/announcements');
const ticketRoutes = require('./routes/tickets');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const reportsRoutes = require('./routes/reports');
const paymentsRoutes = require('./routes/payments');
const webhooksRoutes = require('./routes/webhooks');
const bookingsRoutes = require('./routes/bookings');
const chatRoutes = require('./routes/chat');
const pollsRoutes = require('./routes/polls');
const documentsRoutes = require('./routes/documents');
const phoneRoutes = require('./routes/phone');
const accessLogRoutes = require('./routes/accessLogs');
const accessPreauthorizationRoutes = require('./routes/accessPreauthorizations');
const { startReminders } = require('./jobs/reminders');
const { init: initMasterTicketQueue } = require('./jobs/masterTicketQueue');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);

app.use('/uploads', uploadsAuth, express.static('uploads'));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/hierarchy', hierarchyRoutes);
app.use('/api/master-tickets', masterTicketsRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/access-logs', accessLogRoutes);
app.use('/api/access-preauthorizations', accessPreauthorizationRoutes);
app.use('/api', phoneRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  startReminders();
  initMasterTicketQueue();
});
