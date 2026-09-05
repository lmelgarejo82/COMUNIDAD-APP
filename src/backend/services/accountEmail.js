const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: Number.parseInt(process.env.EMAIL_PORT || '587', 10),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function sendResidentInviteEmail({ email, inviteUrl, unitNumber, ownershipType }) {
  return transporter.sendMail({
    from: '"Comunidad App" <noreply@comunidad.app>',
    to: email,
    subject: 'Invitación a Comunidad App',
    html: `<h2>Fuiste invitado a Comunidad App</h2>
      <p>Hacé clic en el siguiente enlace para registrarte:</p>
      <a href="${inviteUrl}">${inviteUrl}</a>
      <p><strong>Unidad asignada:</strong> ${unitNumber}</p>
      <p><strong>Tipo:</strong> ${ownershipType === 'owner' ? 'Propietario' : 'Inquilino'}</p>
      <p>Este enlace expira en 7 días.</p>`,
  });
}

async function sendPasswordResetEmail({ email, resetUrl }) {
  return transporter.sendMail({
    from: '"Comunidad App" <noreply@comunidad.app>',
    to: email,
    subject: 'Restablecer contraseña',
    html: `<h2>Restablecimiento de contraseña</h2>
      <p>Hacé clic en el siguiente enlace para restablecer tu contraseña:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>Este enlace expira en 1 hora.</p>
      <p>Si no solicitaste este cambio, ignorá este mensaje.</p>`,
  });
}

module.exports = { sendResidentInviteEmail, sendPasswordResetEmail };
