'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<
    { type: string; inApp: boolean; email: boolean }[]
  >([]);
  const MANDATORY = ['SLA_BREACHED', 'INCIDENT_DECLARED'];

  useEffect(() => {
    void apiFetch<{ data: { type: string; inApp: boolean; email: boolean }[] }>(
      '/notifications/preferences',
    )
      .then((body) => setPreferences(body.data))
      .catch(() => undefined);
  }, []);

  const savePreferences = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences }),
      });
      toast('Notification preferences saved');
    } catch (mutationError) {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : 'Something went wrong. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone.trim() ? phone : null,
          timezone,
        }),
      });
      await refresh();
      toast('Profile updated');
    } catch (mutationError) {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : 'Something went wrong. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email} · {user.roles.map((role) => role.name).join(', ')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="profile-first" required>
            <Input
              id="profile-first"
              required
              maxLength={100}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="profile-last" required>
            <Input
              id="profile-last"
              required
              maxLength={100}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Phone" htmlFor="profile-phone">
          <Input
            id="profile-phone"
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>

        <Field label="Timezone" htmlFor="profile-timezone" hint="IANA timezone, e.g. Asia/Karachi.">
          <Input
            id="profile-timezone"
            maxLength={64}
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </Field>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </form>

      <div className="rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Notification preferences</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          SLA breach and major incident alerts are always delivered in-app.
        </p>
        <ul className="mt-3 space-y-2">
          {preferences.map((preference, index) => (
            <li key={preference.type} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{preference.type.toLowerCase().replaceAll('_', ' ')}</span>
              <span className="flex items-center gap-4">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={preference.inApp}
                    disabled={MANDATORY.includes(preference.type)}
                    onChange={(event) =>
                      setPreferences((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, inApp: event.target.checked } : entry,
                        ),
                      )
                    }
                  />
                  In-app
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={preference.email}
                    onChange={(event) =>
                      setPreferences((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, email: event.target.checked } : entry,
                        ),
                      )
                    }
                  />
                  Email
                </label>
              </span>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void savePreferences()}
          disabled={saving || preferences.length === 0}
        >
          Save preferences
        </Button>
      </div>
    </div>
  );
}
