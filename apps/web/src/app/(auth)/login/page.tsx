'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@opsdesk/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/** Seeded demo personas (README "Demo accounts"); password matches the seed. */
const DEMO_PASSWORD = 'ChangeMe!12345';
const DEMO_PERSONAS = [
  { label: 'Admin', email: 'admin@opsdesk.local' },
  { label: 'IT Manager', email: 'manager@opsdesk.local' },
  { label: 'Support Agent', email: 'agent@opsdesk.local' },
  { label: 'Employee', email: 'employee@opsdesk.local' },
] as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoPending, setDemoPending] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const resetCompleted = searchParams.get('reset') === '1';
  const busy = isSubmitting || demoPending !== null;

  const signIn = async (email: string, password: string) => {
    setServerError(null);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      router.push(searchParams.get('next') ?? '/dashboard');
    } catch (error) {
      setServerError(
        error instanceof ApiClientError
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    }
  };

  const onSubmit = handleSubmit((values) => signIn(values.email, values.password));

  const signInAsDemo = async (persona: (typeof DEMO_PERSONAS)[number]) => {
    setValue('email', persona.email);
    setValue('password', DEMO_PASSWORD);
    setDemoPending(persona.email);
    try {
      await signIn(persona.email, DEMO_PASSWORD);
    } finally {
      setDemoPending(null);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {resetCompleted ? (
        <p
          role="status"
          className="rounded-control bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
        >
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}
      <div aria-live="assertive">
        {serverError ? (
          <p
            role="alert"
            className="rounded-control border border-status-danger-bg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg"
          >
            {serverError}
          </p>
        ) : null}
      </div>

      <Field label="Email" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
      </Field>

      <div className="flex items-center justify-between">
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={busy}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground" id="demo-accounts-label">
          Explore a demo account
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" aria-labelledby="demo-accounts-label">
          {DEMO_PERSONAS.map((persona) => (
            <Button
              key={persona.email}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Demo login as ${persona.label}`}
              onClick={() => void signInAsDemo(persona)}
            >
              {demoPending === persona.email ? 'Signing in…' : persona.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Sign in to OpsDesk">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
