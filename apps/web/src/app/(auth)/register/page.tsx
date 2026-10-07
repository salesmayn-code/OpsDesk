'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@opsdesk/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const formSchema = registerSchema.extend({ confirmPassword: z.string().min(1) });
type FormValues = z.infer<typeof formSchema>;

function RegisterForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setMismatch(null);
    if (values.password !== values.confirmPassword) {
      setMismatch('Passwords do not match.');
      return;
    }
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
        }),
      });
      await refresh();
      router.push('/dashboard');
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Something went wrong. Try again.',
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError ? (
        <p
          role="alert"
          className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg"
        >
          {serverError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName" required error={errors.firstName?.message}>
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            {...register('firstName')}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" required error={errors.lastName?.message}>
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            {...register('lastName')}
          />
        </Field>
      </div>

      <Field label="Work email" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>

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
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Employee access to tickets, assets, and knowledge."
    >
      <RegisterForm />
    </AuthShell>
  );
}
