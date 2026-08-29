import { AccountDisabledScreen, AuthLoadingScreen, LoginScreen } from './LoginScreen'
import { useAuth } from './AuthProvider'

export const AuthShell = () => {
  const auth = useAuth()
  if (auth.status === 'initializing') return <AuthLoadingScreen />
  if (auth.status === 'disabled') return <AccountDisabledScreen onSignOut={auth.signOut} />
  return <LoginScreen error={auth.status === 'error' ? auth.error : undefined} onLogin={auth.signIn} onResetPassword={auth.resetPassword} />
}

