export const INVALID_RESET_LINK = 'El enlace es inválido, venció o ya fue utilizado.';

export function validateResetPassword(token, password, confirmation) {
  if (!token) return INVALID_RESET_LINK;
  if (!password || !confirmation) return 'Completá ambos campos de contraseña.';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';
  return null;
}

export function resetPasswordErrorMessage(error) {
  return error?.response?.status === 400
    ? INVALID_RESET_LINK
    : 'No pudimos actualizar la contraseña. Intentá nuevamente.';
}
