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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const resetCompleted = searchParams.get('reset') === '1';

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(values) });
      await refresh();
      router.push(searchParams.get('next') ?? '/dashboard');
    } catch (error) {
      setServerError(
        error instanceof ApiClientError
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    }
  });

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

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
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
