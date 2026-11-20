/* eslint-disable no-console -- CLI script: progress output is the point */
/**
 * Demo activity for a fresh deployment: tickets in every lifecycle state, comments,
 * an active incident, changes awaiting approval and an onboarding request.
 *
 * Runs against the HTTP API as the seeded demo users (not raw SQL), so SLA timers,
 * history, audit rows and notifications are produced by the real business logic.
 * Run after `pnpm db:seed`:  DEMO_API_URL=https://… pnpm --filter @opsdesk/api db:demo
 * Skips itself if any ticket already exists.
 */
const BASE = `${(process.env.DEMO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/api/v1`;
const PASSWORD = 'ChangeMe!12345';

type Json = Record<string, unknown>;
type Ref = { id: string; name?: string; email?: string; version?: number; teamIds?: string[] };

class Session {
  private cookies = new Map<string, string>();
  constructor(readonly email: string) {}

  async call<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair!.indexOf('=');
      this.cookies.set(pair!.slice(0, eq), pair!.slice(eq + 1));
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T;
  }

  async login(): Promise<this> {
    await this.call('POST', '/auth/login', { email: this.email, password: PASSWORD });
    return this;
  }
}

let failures = 0;
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    failures += 1;
    console.warn(`  ✗ ${label}: ${(error as Error).message}`);
    return undefined;
  }
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function main() {
  console.log(`Demo data → ${BASE}`);
  const admin = await new Session('admin@opsdesk.local').login();

  const existing = await admin.call<unknown[]>('GET', '/tickets?pageSize=1&view=all');
  if (existing.length > 0) {
    console.log('Tickets already exist; skipping demo data.');
    return;
  }

  // Extra employees so queues show more than one requester (public self-registration).
  const extraEmployees = [
    ['Fatima', 'Khan', 'fatima.khan@opsdesk.local'],
    ['Usman', 'Ali', 'usman.ali@opsdesk.local'],
    ['Hina', 'Malik', 'hina.malik@opsdesk.local'],
  ] as const;
  for (const [firstName, lastName, email] of extraEmployees) {
    await step(`register ${email}`, () =>
      new Session(email)
        .call('POST', '/auth/register', { firstName, lastName, email, password: PASSWORD })
        .catch((error: Error) => {
          if (!error.message.includes('EMAIL_TAKEN')) throw error; // re-run after a partial run
        }),
    );
  }

  const login = (email: string) => new Session(email).login();
  const [employee, agent, agent2, manager] = await Promise.all([
    login('employee@opsdesk.local'),
    login('agent@opsdesk.local'),
    login('agent2@opsdesk.local'),
    login('manager@opsdesk.local'),
  ]);

  const users = await admin.call<Ref[]>('GET', '/users?pageSize=100');
  const userId = (email: string) => users.find((u) => u.email === email)?.id;
  const categories = await admin.call<(Ref & { children: Ref[] })[]>('GET', '/categories');
  const category = (name: string, child?: string) => {
    const parent = categories.find((c) => c.name === name);
    return { categoryId: parent?.id, subcategoryId: parent?.children.find((c) => c.name === child)?.id };
  };
  const services = await admin.call<Ref[]>('GET', '/services');
  const serviceId = (name: string) => services.find((s) => s.name === name)?.id;
  const myAssets = await employee.call<Ref[]>('GET', '/users/me/assets');
  const laptopId = myAssets.find((a) => a.name && /latitude|thinkpad|macbook|elitebook/i.test(a.name))?.id ?? myAssets[0]?.id;

  type Plan = {
    by: Session;
    requester?: string;
    title: string;
    description: string;
    type: string;
    cat: [string, string?];
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    asset?: boolean;
    assignee?: Session;
    to?: 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
    comments?: [Session, string, 'PUBLIC' | 'INTERNAL'][];
  };

  const plans: Plan[] = [
    { by: employee, title: 'VPN drops every 10 minutes when working from home', description: 'Since Monday the GlobalProtect VPN disconnects roughly every 10 minutes. I have to re-authenticate each time, which interrupts month-end reporting.', type: 'INCIDENT', cat: ['Network', 'VPN'], priority: 'HIGH', assignee: agent, to: 'IN_PROGRESS', comments: [[agent, 'Thanks Ahmed, I can see repeated re-key failures on your tunnel. Investigating the gateway logs now.', 'PUBLIC'], [agent, 'Same gateway as the DNS incident? Checking with Network Team.', 'INTERNAL']] },
    { by: employee, title: 'Laptop battery drains to 0% within two hours', description: 'My laptop battery goes from full to empty in under two hours even with only Excel open. It also gets very hot near the hinge.', type: 'INCIDENT', cat: ['Hardware'], priority: 'MEDIUM', asset: true, assignee: agent, to: 'WAITING_FOR_USER', comments: [[agent, 'Could you run `powercfg /batteryreport` and attach the HTML file it creates? That tells us the wear level.', 'PUBLIC']] },
    { by: employee, title: 'Need access to the Finance shared drive (Q4 folder)', description: 'Please grant read/write access to \\\\fs01\\finance\\Q4 for month-end close. My manager Omar has approved.', type: 'ACCESS_REQUEST', cat: ['Access'], priority: 'MEDIUM', assignee: agent2, to: 'RESOLVED', comments: [[agent2, 'Access granted via the FIN-Q4-RW group. Please sign out and back in for it to apply.', 'PUBLIC']] },
    { by: employee, title: 'Outlook keeps asking for my password', description: 'Outlook prompts for credentials several times a day since the password change last week.', type: 'INCIDENT', cat: ['Email'], priority: 'LOW', assignee: agent2, to: 'CLOSED', comments: [[agent2, 'Cleared the stale credentials from Windows Credential Manager — should be fixed now.', 'PUBLIC'], [employee, 'Confirmed, no more prompts. Thanks!', 'PUBLIC']] },
    { by: employee, title: 'Request: second monitor for finance desk', description: 'Requesting a 24" external monitor for reconciliation work. Desk F-12, 3rd floor.', type: 'HARDWARE_REQUEST', cat: ['Hardware'], priority: 'LOW' },
    { by: employee, title: 'Power BI Pro licence for quarterly dashboards', description: 'I need a Power BI Pro licence to publish the quarterly finance dashboards to the team workspace.', type: 'SOFTWARE_REQUEST', cat: ['Software'], priority: 'MEDIUM', assignee: agent2 },
    { by: admin, requester: 'fatima.khan@opsdesk.local', title: 'Printer on 2nd floor jams on every double-sided job', description: 'The HP printer next to HR jams whenever duplex printing is selected. Single-sided works.', type: 'INCIDENT', cat: ['Printing'], priority: 'LOW', assignee: agent, to: 'IN_PROGRESS' },
    { by: admin, requester: 'usman.ali@opsdesk.local', title: 'Payroll system shows "session expired" right after login', description: 'Every time I log into the payroll portal it immediately says the session expired. Payroll run is due Friday.', type: 'INCIDENT', cat: ['Software'], priority: 'CRITICAL', assignee: agent, to: 'ESCALATED', comments: [[agent, 'Reproduced. This looks server-side (SSO token audience mismatch) — escalating to Infrastructure.', 'INTERNAL']] },
    { by: admin, requester: 'hina.malik@opsdesk.local', title: 'Suspicious email asking to "verify mailbox quota"', description: 'Received an email with a link to "verify mailbox quota" from an external address. I did not click it. Forwarding for review.', type: 'INCIDENT', cat: ['Security'], priority: 'HIGH' },
    { by: admin, requester: 'hina.malik@opsdesk.local', title: 'New starter needs Adobe Acrobat Pro', description: 'Our new HR coordinator starts next week and needs Acrobat Pro for contract signing.', type: 'SOFTWARE_REQUEST', cat: ['Software'], priority: 'LOW' },
    { by: admin, requester: 'fatima.khan@opsdesk.local', title: 'Wi-Fi very slow in meeting room B', description: 'Video calls in meeting room B keep freezing. Speed test shows under 2 Mbps.', type: 'INCIDENT', cat: ['Network', 'Wi-Fi'], priority: 'MEDIUM', assignee: agent, to: 'RESOLVED' },
    { by: admin, requester: 'usman.ali@opsdesk.local', title: 'Reset MFA device after phone replacement', description: 'I replaced my phone and no longer have the authenticator app. Need my MFA reset.', type: 'ACCESS_REQUEST', cat: ['Accounts'], priority: 'HIGH', assignee: agent2, to: 'IN_PROGRESS' },
  ];

  const tickets: (Ref & { title: string })[] = [];
  for (const plan of plans) {
    const created = await step(`create "${plan.title}"`, () =>
      plan.by.call<Ref & { version: number }>('POST', '/tickets', {
        title: plan.title,
        description: plan.description,
        type: plan.type,
        ...category(...plan.cat),
        requestedPriority: plan.priority,
        ...(plan.asset && laptopId ? { assetId: laptopId } : {}),
        ...(plan.requester ? { requesterId: userId(plan.requester) } : {}),
      }),
    );
    if (!created) continue;
    tickets.push({ ...created, title: plan.title });
    let version = created.version;
    const as = (s: Session) => ({
      transition: async (to: string, extra: Json = {}) => {
        const t = await s.call<{ version: number }>('POST', `/tickets/${created.id}/transitions`, { version, to, ...extra });
        version = t.version;
      },
      comment: (body: string, visibility: 'PUBLIC' | 'INTERNAL') =>
        s.call('POST', `/tickets/${created.id}/comments`, { body, visibility }),
    });

    if (plan.priority !== 'MEDIUM') {
      await step(`priority ${plan.title}`, async () => {
        version = (await admin.call<{ version: number }>('PATCH', `/tickets/${created.id}`, { version, priority: plan.priority })).version;
      });
    }
    if (!plan.assignee) continue;
    // Agents can only take tickets for teams they belong to (BR-9), so route to one of theirs.
    const assignee = users.find((u) => u.email === plan.assignee!.email);
    const assigned = await step(`assign ${plan.title}`, () =>
      admin.call<{ version: number }>('POST', `/tickets/${created.id}/assignment`, {
        version,
        teamId: assignee?.teamIds?.[0],
        assigneeId: assignee?.id,
      }),
    );
    if (!assigned) continue;
    version = assigned.version;

    const worker = as(plan.assignee);
    const comments = plan.comments ?? [];
    const progress = ['IN_PROGRESS', 'WAITING_FOR_USER', 'ESCALATED', 'RESOLVED', 'CLOSED'];
    if (plan.to && progress.includes(plan.to)) await step(`start ${plan.title}`, () => worker.transition('IN_PROGRESS'));
    for (const [who, body, visibility] of comments.slice(0, 1)) await step('comment', () => as(who).comment(body, visibility));
    if (plan.to === 'WAITING_FOR_USER') await step('wait', () => worker.transition('WAITING_FOR_USER'));
    if (plan.to === 'ESCALATED') await step('escalate', () => worker.transition('ESCALATED', { reason: 'Needs Infrastructure team: SSO configuration issue.' }));
    if (plan.to === 'RESOLVED' || plan.to === 'CLOSED') {
      await step('resolve', () =>
        worker.transition('RESOLVED', { resolution: { code: plan.type === 'ACCESS_REQUEST' ? 'ACCESS_GRANTED' : 'FIXED', summary: comments[0]?.[1] ?? 'Issue fixed and verified with the requester.' } }),
      );
    }
    for (const [who, body, visibility] of comments.slice(1)) await step('comment', () => as(who).comment(body, visibility));
    if (plan.to === 'CLOSED') {
      const requester = plan.requester ? await new Session(plan.requester).login() : employee;
      await step('close', () => as(requester).transition('CLOSED'));
    }
  }

  // Incident: active SEV2 with linked tickets and timeline.
  const incident = await step('declare incident', () =>
    manager.call<Ref & { version: number }>('POST', '/incidents', {
      title: 'Intermittent VPN and SSO failures for remote staff',
      description: 'Multiple reports of VPN tunnels dropping and SSO sessions expiring immediately after login.',
      severity: 'SEV2',
      serviceId: serviceId('VPN'),
      impact: 'Remote staff (≈60 users) intermittently unable to reach internal apps; payroll portal affected.',
      startedAt: hoursFromNow(-3),
      detectedAt: hoursFromNow(-2.5),
      detectionMethod: 'User reports',
    }),
  );
  if (incident) {
    let version = incident.version;
    const linked = tickets.filter((t) => /VPN|Payroll/.test(t.title)).map((t) => t.id);
    await step('link tickets', () => manager.call('POST', `/incidents/${incident.id}/tickets`, { ticketIds: linked }));
    await step('investigate', async () => {
      version = (await manager.call<{ version: number }>('POST', `/incidents/${incident.id}/transitions`, { version, to: 'INVESTIGATING' })).version;
    });
    await step('timeline', () =>
      manager.call('POST', `/incidents/${incident.id}/timeline`, { body: 'Gateway vpn-gw-02 shows certificate re-key failures since 06:40. Failing over to vpn-gw-01.' }),
    );
  }

  // Changes: one awaiting approval, one scheduled standard change.
  const normal = await step('create normal change', () =>
    agent.call<Ref & { version: number }>('POST', '/changes', {
      title: 'Renew VPN gateway certificates and rotate to new CA',
      description: 'Replace expiring certificates on vpn-gw-01/02 and move to the new internal CA.',
      type: 'NORMAL',
      risk: 'HIGH',
      serviceIds: [serviceId('VPN')].filter(Boolean),
      incidentId: incident?.id,
      scheduledStart: hoursFromNow(48),
      scheduledEnd: hoursFromNow(50),
      implementationPlan: '1. Drain vpn-gw-02\n2. Install new cert chain\n3. Restore traffic\n4. Repeat for vpn-gw-01',
      validationPlan: 'Connect test clients from three ISPs; confirm no re-key errors for 30 minutes.',
      rollbackPlan: 'Re-import the previous certificate bundle from the vault and restart the gateway service.',
    }),
  );
  if (normal) await step('submit normal change', () => agent.call('POST', `/changes/${normal.id}/submit`, { version: normal.version }));

  const standard = await step('create standard change', () =>
    agent2.call<Ref & { version: number }>('POST', '/changes', {
      title: 'Monthly Windows patching — finance laptops',
      description: 'Standard monthly cumulative update rollout to the finance laptop ring.',
      type: 'STANDARD',
      risk: 'LOW',
      scheduledStart: hoursFromNow(72),
      scheduledEnd: hoursFromNow(76),
      implementationPlan: 'Deploy via Intune to the Finance ring with a 2-hour deadline.',
      validationPlan: 'Check Intune compliance report reaches 95% within 24 hours.',
      rollbackPlan: 'Pause the ring and uninstall the update via Intune.',
    }),
  );
  if (standard) await step('submit standard change', () => agent2.call('POST', `/changes/${standard.id}/submit`, { version: standard.version }));

  // Onboarding for one of the new employees.
  const subject = userId('hina.malik@opsdesk.local');
  if (subject) {
    await step('onboarding request', () =>
      admin.call('POST', '/onboarding', {
        subjectUserId: subject,
        effectiveDate: hoursFromNow(24 * 5).slice(0, 10),
        managerId: userId('manager@opsdesk.local'),
        notes: 'HR coordinator — needs laptop, Acrobat Pro and HRIS access.',
      }),
    );
  }

  console.log(`Created ${tickets.length} tickets${failures ? `, ${failures} step(s) failed (see above)` : ''}.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
