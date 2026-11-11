import type { AuthError } from '@supabase/supabase-js'
import { t } from './lang'

// Sign-in errors in plain words (English / Spanish) instead of Supabase's own text
export function authMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return t('Wrong email or password. If you forgot your password, tap Forgot password below.',
        'Correo o contraseña incorrectos. Si olvidó su contraseña, toque Olvidé mi contraseña abajo.')
    case 'email_not_confirmed':
      return t('Your email is not confirmed yet. Open the newest email from us and tap the link, or tap Send the email again.',
        'Su correo aún no está confirmado. Abra el correo más reciente que le enviamos y toque el enlace, o toque Enviar el correo otra vez.')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t('We already sent you an email. Check your inbox and spam folder, and use the newest email. You can ask for another one in an hour.',
        'Ya le enviamos un correo. Revise su bandeja de entrada y spam, y use el correo más reciente. Puede pedir otro en una hora.')
    case 'user_already_exists':
    case 'email_exists':
      return t('This email already has an account. Sign in, or tap Forgot password.',
        'Este correo ya tiene una cuenta. Entre, o toque Olvidé mi contraseña.')
    case 'weak_password':
      return t('Please use a longer password (at least 8 characters).', 'Use una contraseña más larga (por lo menos 8 letras o números).')
    case 'same_password':
      return t('That is your current password. Choose a different one.', 'Esa es su contraseña actual. Elija otra.')
    default:
      return error.message
  }
}
