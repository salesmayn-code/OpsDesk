'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@opsdesk/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api-client';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    } finally {
      // Identical outcome whether or not the account exists.
      setSent(true);
    }
  });

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
      {sent ? (
        <div className="space-y-4 text-sm">
          <p role="status" className="text-foreground">
            If an account exists for that email, a reset link is on its way. The link expires in
            30 minutes.
          </p>
          <Link href="/login" className="block text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
