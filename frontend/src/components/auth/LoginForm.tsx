'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, type LoginFormValues } from '@/lib/validations/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { ApiError } from '@/lib/api-errors';
import { Loader } from '@/components/ui/loader';

export function LoginForm() {
  const router = useRouter();
  const { login, verifyMfaLogin, refreshUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [securityAlert, setSecurityAlert] = useState<{
    risk_level: string;
    reasons: string[];
    location: string;
  } | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    if (!token) return;

    localStorage.setItem('devmeet_access_token', token);
    refreshUser()
      .then(() => {
        toast.success('Signed in successfully');
        router.push('/dashboard');
      })
      .catch(() => {
        setServerError('Failed to authenticate with social login. Please try again.');
      });
  }, [router, refreshUser]);

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsLocked(false);
    setSecurityAlert(null);
    try {
      const result = await login(values);
      if ('mfa_required' in result && result.mfa_required && result.mfa_token) {
        setMfaToken(result.mfa_token);
        toast.info('Enter your authenticator code to continue.');
        return;
      }
      if ('security_alert' in result && result.security_alert) {
        setSecurityAlert(result.security_alert);
      }
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : null;
      if (status === 423) {
        setIsLocked(true);
        setServerError(
          'Your account has been temporarily locked due to too many failed attempts.'
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Invalid email or password.';
        setServerError(msg);
      }
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || !mfaCode.trim()) return;
    setMfaSubmitting(true);
    setServerError(null);
    try {
      await verifyMfaLogin({
        mfa_token: mfaToken,
        ...(useBackupCode
          ? { backup_code: mfaCode.trim() }
          : { totp_code: mfaCode.trim() }),
      });
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Invalid MFA code.');
    } finally {
      setMfaSubmitting(false);
    }
  };

  if (mfaToken) {
    return (
      <div className="space-y-6">
        {mfaSubmitting && <Loader fullscreen text="Verifying code..." />}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Two-factor authentication</h1>
          <p className="text-slate-500 text-sm">
            Enter the {useBackupCode ? 'backup' : '6-digit'} code to complete sign-in.
          </p>
        </div>

        {serverError && <ErrorAlert message={serverError} variant="error" />}

        <form onSubmit={onMfaSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">
              {useBackupCode ? 'Backup code' : 'Authenticator code'}
            </Label>
            <Input
              id="mfa-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder={useBackupCode ? 'XXXXXXXXXX' : '000000'}
              maxLength={useBackupCode ? 20 : 6}
              autoComplete="one-time-code"
              disabled={mfaSubmitting}
            />
          </div>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={mfaSubmitting}>
            {mfaSubmitting ? 'Verifying…' : 'Verify & Sign In'}
          </Button>

          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            onClick={() => {
              setUseBackupCode((p) => !p);
              setMfaCode('');
            }}
          >
            {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
          </button>

          <button
            type="button"
            className="block text-xs text-slate-500 hover:text-slate-700"
            onClick={() => {
              setMfaToken(null);
              setMfaCode('');
            }}
          >
            ← Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isSubmitting && <Loader fullscreen text="Signing you in..." />}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-slate-500 text-sm">Sign in to continue your interview prep.</p>
      </div>

      {securityAlert && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <ShieldAlert className="w-4 h-4" />
            Unusual sign-in detected ({securityAlert.risk_level})
          </div>
          <p className="text-xs text-amber-800">
            Location: {securityAlert.location}. {securityAlert.reasons.join('; ')}
          </p>
        </div>
      )}

      {serverError && (
        <ErrorAlert
          message={serverError}
          variant={isLocked ? 'warning' : 'error'}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={!!errors.email}
            disabled={isSubmitting}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-rose-600 font-medium">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              error={!!errors.password}
              disabled={isSubmitting}
              className="pr-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-rose-600 font-medium">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-11 font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-100" />
        <span className="flex-shrink mx-4 text-slate-400 text-xs font-semibold uppercase tracking-wider">
          Or continue with
        </span>
        <div className="flex-grow border-t border-slate-100" />
      </div>

      <OAuthButtons disabled={isSubmitting} />

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-blue-600 font-semibold hover:text-blue-700">
          Sign up
        </Link>
      </p>
    </div>
  );
}
