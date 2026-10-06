'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@opsdesk/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const formSchema = resetPasswordSchema.extend({ confirmPassword: z.string().min(1) });
type FormValues = z.infer<typeof formSchema>;

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { token, newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setMismatch(null);
    if (values.newPassword !== values.confirmPassword) {
      setMismatch('Passwords do not match.');
      return;
    }
    try {
      await apiFetch('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token: values.token, newPassword: values.newPassword }),
      });
      router.push('/login?reset=1');
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Something went wrong. Try again.',
      );
    }
  });

  if (!token) {
    return (
      <p role="alert" className="text-sm text-status-danger-fg">
        This reset link is missing its token. Request a new link from the sign-in page.
      </p>
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
        label="New password"
        htmlFor="newPassword"
        required
        hint="At least 12 characters."
        error={errors.newPassword?.message}
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.newPassword)}
          {...register('newPassword')}
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
        {isSubmitting ? 'Setting password…' : 'Set new password'}
      </Button>
      <Link href="/login" className="block text-center text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
