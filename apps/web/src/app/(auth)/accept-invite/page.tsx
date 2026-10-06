'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { acceptInviteSchema } from '@opsdesk/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const formSchema = acceptInviteSchema.extend({ confirmPassword: z.string().min(1) });
type FormValues = z.infer<typeof formSchema>;

function AcceptForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setMismatch(null);
    if (values.password !== values.confirmPassword) {
      setMismatch('Passwords do not match.');
      return;
    }
    try {
      await apiFetch('/auth/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: values.token, password: values.password }),
      });
      setDone(true);
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Something went wrong. Try again.',
      );
    }
  });

  if (!token) {
    return (
      <p role="alert" className="text-sm text-status-danger-fg">
        This invitation link is incomplete. Ask IT to resend your invitation.
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm">
        <p role="status">Your account is active. You can sign in now.</p>
        <Link href="/login" className="block text-primary underline-offset-4 hover:underline">
          Sign in to OpsDesk
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" {...register('token')} />
      {serverError ? (
        <p
          role="alert"
          className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg"
        >
          {serverError}
        </p>
      ) : null}
      <Field
        label="Password"
        htmlFor="password"
        required
        hint="At least 12 characters."
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>
      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        required
        error={mismatch ?? errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(mismatch ?? errors.confirmPassword)}
          {...register('confirmPassword')}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Activating…' : 'Activate account'}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <AuthShell title="Welcome to OpsDesk" subtitle="Set a password to activate your account.">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AcceptForm />
      </Suspense>
    </AuthShell>
  );
}
