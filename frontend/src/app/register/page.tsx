'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Brain, Code2, Eye, EyeOff, Zap, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { registerSchema, type RegisterFormValues } from '@/lib/validations/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';

const STATS = [
  { icon: <Zap className="w-4 h-4 text-yellow-300" />, label: '98% Success Rate' },
  { icon: <Brain className="w-4 h-4 text-blue-300" />, label: 'AI-Powered Evaluations' },
  { icon: <ShieldCheck className="w-4 h-4 text-emerald-300" />, label: 'Enterprise Security' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      display_name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async ({ confirmPassword, ...values }: RegisterFormValues) => {
    setServerError(null);
    try {
      await registerUser(values);
      toast.success('Account created successfully');
      router.push('/dashboard');
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left panel - matching LoginPage branded identity */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-blue-600 flex-col justify-between p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <Link href="/" className="relative z-10 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">DevMeet</span>
        </Link>

        <div className="relative z-10 space-y-6">
          <blockquote className="text-4xl font-bold text-white leading-tight">
            Build interview confidence with{' '}
            <span className="text-sky-200 font-extrabold">
              deliberate practice.
            </span>
          </blockquote>
          <p className="text-blue-100 text-lg max-w-sm leading-relaxed">
            Create an account to start mock interviews, track skill progression, and review detailed STAR feedback.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 px-4 py-3 w-fit rounded-xl border border-white/30 bg-white/20 backdrop-blur-md"
              >
                {stat.icon}
                <span className="text-white text-sm font-medium">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-blue-200/60 text-xs">
          © {new Date().getFullYear()} DevMeet. All rights reserved.
        </p>
      </div>

      {/* Right panel */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10">
          <Brain className="w-6 h-6 text-blue-600" />
          <span className="text-2xl font-bold text-slate-900">DevMeet</span>
        </Link>

        <div className="w-full max-w-md bg-white border border-blue-100/80 shadow-2xl shadow-blue-500/5 rounded-2xl p-8 md:p-10">
          <div className="mb-6 space-y-1">
            <h2 className="text-2xl font-bold text-slate-900">Create account</h2>
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                Sign in
              </Link>
            </p>
          </div>

          {serverError ? <ErrorAlert message={serverError} /> : null}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Full Name</Label>
              <Input
                id="display_name"
                autoComplete="name"
                placeholder="Jane Doe"
                error={!!errors.display_name}
                disabled={isSubmitting}
                {...register('display_name')}
              />
              {errors.display_name ? (
                <p className="text-xs text-rose-600 font-medium">{errors.display_name.message}</p>
              ) : null}
            </div>

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
              {errors.email ? (
                <p className="text-xs text-rose-600 font-medium">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  error={!!errors.password}
                  disabled={isSubmitting}
                  className="pr-11"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="text-xs text-rose-600 font-medium">{errors.password.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={!!errors.confirmPassword}
                disabled={isSubmitting}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-rose-600 font-medium">{errors.confirmPassword.message}</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10 transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-blue-600 hover:underline">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
