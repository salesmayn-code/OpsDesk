/**
 * OpsDesk reference seed (Backend Schema §9). Idempotent: safe to run repeatedly.
 * Sample tickets are seeded from the ticket service in Sprint 1.2/1.3 so that
 * history/SLA rows stay consistent with domain rules.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { PERMISSION_KEYS } from '@opsdesk/contracts';
import { uuidv7 } from '../src/common/id';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'ChangeMe!12345';

type Tx = Prisma.TransactionClient;

async function seedPermissions(tx: Tx) {
  for (const key of PERMISSION_KEYS) {
    const [resource, action] = key.split(':');
    await tx.permission.upsert({
      where: { key },
      update: {},
      create: { id: uuidv7(), key, resource: resource!, action: action! },
    });
  }
}

async function seedRoles(tx: Tx) {
  const all = [...PERMISSION_KEYS];
  // Note: EMPLOYEE intentionally has no `ticket:reopen` — requesters may reopen
  // only within the reopen window (policy-scoped), agents hold the permission.
  const employee = [
    'ticket:create',
    'ticket:view',
    'ticket:close',
    'attachment:upload',
    'asset:view',
    'kb:view',
  ];
  const agent = [
    ...employee,
    'ticket:view_team',
    'ticket:view_internal',
    'ticket:update',
    'ticket:triage',
    'ticket:assign',
    'ticket:resolve',
    'ticket:comment_internal',
    'attachment:delete',
    'asset:view_all',
    'asset:update',
    'asset:assign',
    'user:view',
    'kb:create',
    'incident:create',
    'incident:view',
    'change:create',
    'change:view',
    'change:implement',
    'workflow:view',
  ] as const;
  const manager = [
    ...agent,
    'ticket:view_all',
    'ticket:reassign',
    'ticket:cancel',
    'asset:create',
    'asset:retire',
    'asset:dispose',
    'incident:manage',
    'incident:close',
    'postmortem:manage',
    'change:approve',
    'workflow:create',
    'workflow:manage',
    'kb:publish',
    'audit:view',
    'reports:view',
  ] as const;

  const roles: Record<string, string[]> = {
    EMPLOYEE: employee,
    AGENT: [...new Set<string>(agent)],
    MANAGER: [...new Set<string>(manager)],
    ADMIN: all,
  };

  for (const [key, permissions] of Object.entries(roles)) {
    const role = await tx.role.upsert({
      where: { key },
      update: { name: roleName(key) },
      create: { id: uuidv7(), key, name: roleName(key), isSystem: true },
    });
    const permissionRows = await tx.permission.findMany({ where: { key: { in: permissions } } });
    await tx.rolePermission.createMany({
      data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    // Declarative seed: prune mappings that are no longer in the role definition.
    await tx.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { key: { notIn: permissions } } },
    });
  }
}

function roleName(key: string) {
  return { EMPLOYEE: 'Employee', AGENT: 'Support Agent', MANAGER: 'IT Manager', ADMIN: 'Administrator' }[key] ?? key;
}

async function seedOrg(tx: Tx) {
  const departments = [
    ['Finance', 'FIN'],
    ['HR', 'HR'],
    ['Sales', 'SAL'],
    ['Engineering', 'ENG'],
    ['Operations', 'OPS'],
    ['Marketing', 'MKT'],
    ['IT', 'IT'],
  ] as const;
  for (const [name, code] of departments) {
    await tx.department.upsert({ where: { code }, update: { name }, create: { id: uuidv7(), name, code } });
  }

  const teams = ['Help Desk', 'Desktop Support', 'Network Team', 'Infrastructure', 'Security', 'DevOps'];
  for (const name of teams) {
    await tx.team.upsert({
      where: { name },
      update: {},
      create: { id: uuidv7(), name, description: `${name} support team` },
    });
  }
}

async function seedUsers(tx: Tx) {
  const passwordHash = await hash(DEV_PASSWORD);
  const it = await tx.department.findUniqueOrThrow({ where: { code: 'IT' } });
  const finance = await tx.department.findUniqueOrThrow({ where: { code: 'FIN' } });
  const roles = await tx.role.findMany();
  const roleId = (key: string) => roles.find((r) => r.key === key)!.id;

  const people: {
    email: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    departmentId: string;
    roleKey: string;
    teamNames?: string[];
  }[] = [
    {
      email: 'admin@opsdesk.local',
      firstName: 'Lina',
      lastName: 'Iqbal',
      jobTitle: 'Systems Administrator',
      departmentId: it.id,
      roleKey: 'ADMIN',
    },
    {
      email: 'manager@opsdesk.local',
      firstName: 'Omar',
      lastName: 'Rashid',
      jobTitle: 'IT Manager',
      departmentId: it.id,
      roleKey: 'MANAGER',
      teamNames: ['Help Desk', 'Desktop Support'],
    },
    {
      email: 'manager2@opsdesk.local',
      firstName: 'Nadia',
      lastName: 'Farooq',
      jobTitle: 'Infrastructure Manager',
      departmentId: it.id,
      roleKey: 'MANAGER',
      teamNames: ['Infrastructure', 'Network Team'],
    },
    {
      email: 'agent@opsdesk.local',
      firstName: 'Sara',
      lastName: 'Khan',
      jobTitle: 'Desktop Support Engineer',
      departmentId: it.id,
      roleKey: 'AGENT',
      teamNames: ['Desktop Support', 'Help Desk'],
    },
    {
      email: 'agent2@opsdesk.local',
      firstName: 'Bilal',
      lastName: 'Raza',
      jobTitle: 'Service Desk Analyst',
      departmentId: it.id,
      roleKey: 'AGENT',
      teamNames: ['Help Desk'],
    },
    {
      email: 'employee@opsdesk.local',
      firstName: 'Ahmed',
      lastName: 'Siddiqui',
      jobTitle: 'Finance Analyst',
      departmentId: finance.id,
      roleKey: 'EMPLOYEE',
    },
  ];

  const ids: Record<string, string> = {};
  for (const p of people) {
    const user = await tx.user.upsert({
      where: { email: p.email },
      // Dev convenience: re-seeding restores the documented demo password if a
      // password-reset test changed it (Backend Schema §9: password is dev-only).
      update: { passwordHash },
      create: {
        id: uuidv7(),
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        jobTitle: p.jobTitle,
        departmentId: p.departmentId,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        timezone: 'Asia/Karachi',
      },
    });
    ids[p.email] = user.id;
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleId(p.roleKey) } },
      update: {},
      create: { userId: user.id, roleId: roleId(p.roleKey) },
    });
    for (const teamName of p.teamNames ?? []) {
      const team = await tx.team.findUniqueOrThrow({ where: { name: teamName } });
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: user.id } },
        update: {},
        create: { teamId: team.id, userId: user.id },
      });
    }
  }

  // Team leads / managers (plain UUID columns, no FK).
  const managerId = ids['manager@opsdesk.local']!;
  for (const name of ['Help Desk', 'Desktop Support']) {
    await tx.team.update({ where: { name }, data: { leadId: managerId, managerId } });
  }

  await tx.setting.upsert({
    where: { key: 'org_timezone' },
    update: {},
    create: { key: 'org_timezone', value: 'Asia/Karachi' },
  });

  return ids;
}

async function seedCatalog(tx: Tx) {
  const teamId = async (name: string) =>
    (await tx.team.findUniqueOrThrow({ where: { name } })).id;

  const withChildren: {
    name: string;
    team: string;
    children?: { name: string; team: string }[];
  }[] = [
    { name: 'Hardware', team: 'Desktop Support' },
    { name: 'Software', team: 'Help Desk' },
    {
      name: 'Network',
      team: 'Network Team',
      children: [
        { name: 'Wi-Fi', team: 'Network Team' },
        { name: 'VPN', team: 'Network Team' },
        { name: 'LAN', team: 'Network Team' },
        { name: 'Internet', team: 'Network Team' },
      ],
    },
    { name: 'Email', team: 'Help Desk' },
    { name: 'Security', team: 'Security' },
    { name: 'Access', team: 'Help Desk' },
    { name: 'Accounts', team: 'Help Desk' },
    { name: 'Printing', team: 'Desktop Support' },
    { name: 'Other', team: 'Help Desk' },
  ];

  for (const c of withChildren) {
    const parent = await ensureCategory(tx, null, c.name, await teamId(c.team));
    for (const child of c.children ?? []) {
      await ensureCategory(tx, parent.id, child.name, await teamId(child.team));
    }
  }

  const codes: [string, string][] = [
    ['FIXED', 'Fixed'],
    ['WORKAROUND', 'Workaround applied'],
    ['HARDWARE_REPLACED', 'Hardware replaced'],
    ['CONFIG_CHANGED', 'Configuration changed'],
    ['ACCESS_GRANTED', 'Access granted'],
    ['DUPLICATE', 'Duplicate ticket'],
    ['NOT_REPRODUCIBLE', 'Not reproducible'],
    ['USER_ERROR', 'User error'],
    ['NO_RESPONSE', 'No response from user'],
  ];
  for (const [code, label] of codes) {
    await tx.resolutionCode.upsert({ where: { code }, update: { label }, create: { id: uuidv7(), code, label } });
  }
}

async function ensureCategory(tx: Tx, parentId: string | null, name: string, defaultTeamId: string) {
  const existing = await tx.category.findFirst({ where: { parentId, name } });
  if (existing) return existing;
  return tx.category.create({
    data: { id: uuidv7(), name, parentId, defaultTeamId, sortOrder: 0 },
  });
}

async function seedChangeRules(tx: Tx) {
  const rules: [string, string, number, string, boolean][] = [
    ['STANDARD', 'LOW', 0, 'MANAGER', false],
    ['STANDARD', 'MEDIUM', 0, 'MANAGER', false],
    ['STANDARD', 'HIGH', 0, 'MANAGER', false],
    ['STANDARD', 'CRITICAL', 0, 'MANAGER', false],
    ['NORMAL', 'LOW', 1, 'MANAGER', false],
    ['NORMAL', 'MEDIUM', 1, 'MANAGER', false],
    ['NORMAL', 'HIGH', 2, 'MANAGER', false],
    ['NORMAL', 'CRITICAL', 2, 'MANAGER', true],
    ['EMERGENCY', 'LOW', 1, 'MANAGER', false],
    ['EMERGENCY', 'MEDIUM', 1, 'MANAGER', false],
    ['EMERGENCY', 'HIGH', 1, 'MANAGER', false],
    ['EMERGENCY', 'CRITICAL', 1, 'MANAGER', false],
  ];
  for (const [type, risk, requiredApprovals, approverRoleKey, requiresAdmin] of rules) {
    await tx.changeApprovalRule.upsert({
      where: { type_risk: { type: type as never, risk: risk as never } },
      update: {},
      create: {
        id: uuidv7(),
        type: type as never,
        risk: risk as never,
        requiredApprovals,
        approverRoleKey,
        requiresAdmin,
      },
    });
  }
}

async function seedWorkflowTemplates(tx: Tx) {
  const templates: { kind: string; name: string; tasks: unknown[] }[] = [
    {
      kind: 'ONBOARDING',
      name: 'Default onboarding',
      tasks: [
        { title: 'Create identity and email account', offsetDays: -2, required: true, kind: 'GENERIC' },
        { title: 'Provision hardware', offsetDays: -1, required: true, kind: 'GENERIC' },
        { title: 'Grant VPN access', offsetDays: 0, required: true, kind: 'GENERIC' },
        { title: 'Assign laptop and peripherals', offsetDays: 0, required: true, kind: 'GENERIC' },
      ],
    },
    {
      kind: 'OFFBOARDING',
      name: 'Default offboarding',
      tasks: [
        { title: 'Disable identity and email account', offsetDays: 0, required: true, kind: 'GENERIC' },
        { title: 'Revoke VPN and system access', offsetDays: 0, required: true, kind: 'GENERIC' },
        { title: 'Recover company assets', offsetDays: 1, required: true, kind: 'ASSET_RECOVERY' },
      ],
    },
  ];
  for (const template of templates) {
    await tx.workflowTemplate.upsert({
      where: { kind_name: { kind: template.kind as never, name: template.name } },
      update: {},
      create: {
        id: uuidv7(),
        kind: template.kind as never,
        name: template.name,
        tasks: template.tasks as never,
      },
    });
  }
}

async function seedKnowledge(tx: Tx) {
  const admin = await tx.user.findUniqueOrThrow({ where: { email: 'admin@opsdesk.local' } });
  const categoryId = async (name: string) =>
    (await tx.category.findFirst({ where: { name } }))?.id ?? null;

  const articles: { title: string; summary: string; content: string; category: string }[] = [
    {
      title: 'Connecting to the company VPN',
      summary: 'Install the VPN client and connect from anywhere.',
      category: 'VPN',
      content:
        '## Before you start\n- You need an active VPN entitlement (request it via an ACCESS_REQUEST ticket).\n\n## Steps\n1. Install the VPN client from the software portal.\n2. Sign in with your company email and password.\n3. Approve the MFA prompt.\n\n## Troubleshooting\nIf the connection drops, switch networks and retry.',
    },
    {
      title: 'Resetting your password',
      summary: 'Reset your password from the sign-in page.',
      category: 'Accounts',
      content:
        '## Steps\n1. Open the OpsDesk sign-in page and click **Forgot password**.\n2. Enter your email and follow the link (valid for 30 minutes).\n3. Choose a password of at least 12 characters.\n\n## Note\nYou will be signed out of all devices after a reset.',
    },
    {
      title: 'Fixing slow Wi-Fi',
      summary: 'Quick checks before raising a ticket.',
      category: 'Wi-Fi',
      content:
        '## Quick checks\n1. Move closer to the access point.\n2. Toggle Wi-Fi off and on.\n3. Forget and rejoin the network.\n\nIf other devices are fine, raise an incident with your device name and location.',
    },
    {
      title: 'Requesting new hardware',
      summary: 'How to request a laptop, monitor, or peripheral.',
      category: 'Hardware',
      content:
        '## Steps\n1. Create a **HARDWARE_REQUEST** ticket.\n2. Describe the equipment and why it is needed.\n3. Your manager approves the request automatically.\n\nStandard lead time is 5 business days.',
    },
    {
      title: 'Setting up the office printer',
      summary: 'Add the floor printer to your computer.',
      category: 'Printing',
      content:
        '## Steps\n1. Open the print dialog and add a printer by name (`HQ-F3-PRINTER`).\n2. Sign in with your domain account when prompted.\n3. Print a test page.\n\nIf the printer is offline, raise an incident.',
    },
  ];

  for (const article of articles) {
    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    await tx.knowledgeArticle.upsert({
      where: { slug },
      update: {},
      create: {
        id: uuidv7(),
        slug,
        title: article.title,
        summary: article.summary,
        content: article.content,
        categoryId: await categoryId(article.category),
        authorId: admin.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }
}

async function seedServices(tx: Tx) {
  const services = ['VPN', 'Email', 'Website', 'IdP', 'Database'];
  for (const name of services) {
    await tx.service.upsert({
      where: { name },
      update: {},
      create: { id: uuidv7(), name, description: `${name} service` },
    });
  }
}

async function seedSla(tx: Tx) {
  const businessHours = [
    { weekday: 1, start: '09:00', end: '18:00' },
    { weekday: 2, start: '09:00', end: '18:00' },
    { weekday: 3, start: '09:00', end: '18:00' },
    { weekday: 4, start: '09:00', end: '18:00' },
    { weekday: 5, start: '09:00', end: '18:00' },
  ];

  const bh = await tx.businessCalendar.upsert({
    where: { name: 'Business Hours PK' },
    update: {},
    create: {
      id: uuidv7(),
      name: 'Business Hours PK',
      timezone: 'Asia/Karachi',
      schedule: businessHours,
    },
  });
  const allDay = await tx.businessCalendar.upsert({
    where: { name: '24x7' },
    update: {},
    create: { id: uuidv7(), name: '24x7', timezone: 'Asia/Karachi', is24x7: true, schedule: [] },
  });

  const policies: Prisma.SlaPolicyCreateInput[] = [
    {
      id: uuidv7(),
      name: 'Critical',
      priority: 'CRITICAL',
      calendar: { connect: { id: allDay.id } },
      firstResponseMinutes: 15,
      resolutionMinutes: 120,
      pauseOnStatuses: ['WAITING_FOR_USER'],
      sortOrder: 1,
    },
    {
      id: uuidv7(),
      name: 'High',
      priority: 'HIGH',
      calendar: { connect: { id: allDay.id } },
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
      pauseOnStatuses: ['WAITING_FOR_USER'],
      sortOrder: 2,
    },
    {
      id: uuidv7(),
      name: 'Medium',
      priority: 'MEDIUM',
      calendar: { connect: { id: bh.id } },
      firstResponseMinutes: 240, // 4 business hours
      resolutionMinutes: 540, // 1 business day
      pauseOnStatuses: ['WAITING_FOR_USER'],
      sortOrder: 3,
    },
    {
      id: uuidv7(),
      name: 'Low',
      priority: 'LOW',
      calendar: { connect: { id: bh.id } },
      firstResponseMinutes: 480, // 8 business hours
      resolutionMinutes: 1620, // 3 business days
      pauseOnStatuses: ['WAITING_FOR_USER'],
      isDefault: true,
      sortOrder: 4,
    },
  ];
  for (const policy of policies) {
    await tx.slaPolicy.upsert({ where: { name: policy.name as string }, update: {}, create: policy });
  }

  const defaultPolicy = await tx.slaPolicy.findUniqueOrThrow({ where: { name: 'Low' } });
  for (const [key, value] of [
    ['reopen_window_days', 7],
    ['auto_close_enabled', true],
    ['default_sla_policy_id', defaultPolicy.id],
    ['default_calendar_id', bh.id],
  ] as const) {
    await tx.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }
}

async function seedAssets(tx: Tx, userIds: Record<string, string>) {
  const types: [string, string][] = [
    ['Laptop', 'LAP'],
    ['Desktop', 'DSK'],
    ['Monitor', 'MON'],
    ['Phone', 'PHN'],
    ['Tablet', 'TAB'],
    ['Printer', 'PRN'],
    ['Router', 'RTR'],
    ['Switch', 'SWT'],
    ['Server', 'SRV'],
    ['Virtual Machine', 'VM'],
    ['Software License', 'LIC'],
    ['Peripheral', 'PER'],
  ];
  const typeByPrefix: Record<string, string> = {};
  for (const [name, tagPrefix] of types) {
    const t = await tx.assetType.upsert({
      where: { name },
      update: {},
      create: { id: uuidv7(), name, tagPrefix },
    });
    typeByPrefix[tagPrefix] = t.id;
  }

  const hq = await tx.location.upsert({
    where: { name: 'HQ Floor 3' },
    update: {},
    create: { id: uuidv7(), name: 'HQ Floor 3', address: 'Head Office, 3rd Floor' },
  });
  await tx.location.upsert({
    where: { name: 'Server Room' },
    update: {},
    create: { id: uuidv7(), name: 'Server Room' },
  });
  const dell = await tx.vendor.upsert({
    where: { name: 'Dell Pakistan' },
    update: {},
    create: { id: uuidv7(), name: 'Dell Pakistan', contact: 'sales@dell.example' },
  });
  const finance = await tx.department.findUniqueOrThrow({ where: { code: 'FIN' } });

  const samples = [
    { tag: 'LAP-00421', prefix: 'LAP', name: 'Dell Latitude 5550', manufacturer: 'Dell', model: 'Latitude 5550', serial: '7XK2-5550-00421', status: 'ASSIGNED', assignee: 'employee@opsdesk.local', warranty: '2028-06-30', purchase: '2025-06-01', cost: 185000, vendorId: dell.id, locationId: hq.id, departmentId: finance.id },
    { tag: 'LAP-00422', prefix: 'LAP', name: 'HP EliteBook 840 G10', manufacturer: 'HP', model: 'EliteBook 840', serial: 'HP-840-00422', status: 'IN_STOCK', locationId: hq.id },
    { tag: 'DSK-000101', prefix: 'DSK', name: 'Dell OptiPlex 7010', manufacturer: 'Dell', model: 'OptiPlex 7010', serial: 'DELL-7010-00101', status: 'IN_STOCK', locationId: hq.id },
    { tag: 'MON-00112', prefix: 'MON', name: 'Dell P2422H Monitor', manufacturer: 'Dell', model: 'P2422H', serial: 'DELL-P2422-00112', status: 'ASSIGNED', assignee: 'employee@opsdesk.local', warranty: '2027-02-28', locationId: hq.id, departmentId: finance.id },
    { tag: 'PHN-000045', prefix: 'PHN', name: 'iPhone 15', manufacturer: 'Apple', model: 'iPhone 15', serial: 'APPLE-IP15-00045', status: 'IN_STOCK', locationId: hq.id },
    { tag: 'TAB-000021', prefix: 'TAB', name: 'iPad Air (5th gen)', manufacturer: 'Apple', model: 'iPad Air', serial: 'APPLE-IPAD-00021', status: 'IN_STOCK', locationId: hq.id },
    { tag: 'PRN-000008', prefix: 'PRN', name: 'HP LaserJet Pro M404', manufacturer: 'HP', model: 'M404dn', serial: 'HP-M404-00008', status: 'IN_STOCK', locationId: hq.id },
    { tag: 'RTR-000003', prefix: 'RTR', name: 'Cisco ISR 4331', manufacturer: 'Cisco', model: 'ISR 4331', serial: 'CISCO-4331-00003', status: 'IN_STOCK' },
    { tag: 'SWT-000004', prefix: 'SWT', name: 'Cisco Catalyst 9200', manufacturer: 'Cisco', model: 'C9200-24T', serial: 'CISCO-9200-00004', status: 'IN_STOCK' },
    { tag: 'SRV-000002', prefix: 'SRV', name: 'Dell PowerEdge R760', manufacturer: 'Dell', model: 'PowerEdge R760', serial: 'DELL-R760-00002', status: 'IN_STOCK', warranty: '2029-01-31' },
    { tag: 'VM-000031', prefix: 'VM', name: 'Ubuntu App Server', model: 'Ubuntu 24.04', serial: 'VM-UBUNTU-00031', status: 'IN_STOCK' },
    { tag: 'LIC-000012', prefix: 'LIC', name: 'Adobe Creative Cloud (1 seat)', manufacturer: 'Adobe', status: 'IN_STOCK' },
    { tag: 'PER-000067', prefix: 'PER', name: 'Logitech MX Master 3S', manufacturer: 'Logitech', model: 'MX Master 3S', serial: 'LOGI-MX3S-00067', status: 'ASSIGNED', assignee: 'employee@opsdesk.local', locationId: hq.id, departmentId: finance.id },
  ];

  for (const s of samples) {
    const assigneeId = s.assignee ? userIds[s.assignee]! : null;
    const asset = await tx.asset.upsert({
      where: { tag: s.tag },
      update: {},
      create: {
        id: uuidv7(),
        tag: s.tag,
        typeId: typeByPrefix[s.prefix]!,
        name: s.name,
        manufacturer: s.manufacturer ?? null,
        model: s.model ?? null,
        serialNumber: s.serial ?? null,
        status: s.status as never,
        currentAssigneeId: assigneeId,
        warrantyExpiry: s.warranty ? new Date(s.warranty) : null,
        purchaseDate: s.purchase ? new Date(s.purchase) : null,
        purchaseCost: s.cost ? s.cost : null,
        vendorId: s.vendorId ?? null,
        locationId: s.locationId ?? null,
        departmentId: s.departmentId ?? null,
      },
    });

    const existingAssignment = await tx.assetAssignment.findFirst({
      where: { assetId: asset.id, returnedAt: null },
    });
    if (assigneeId && !existingAssignment) {
      const adminId = userIds['admin@opsdesk.local']!;
      await tx.assetAssignment.create({
        data: { id: uuidv7(), assetId: asset.id, userId: assigneeId, assignedById: adminId },
      });
    }

    const eventCount = await tx.assetEvent.count({ where: { assetId: asset.id } });
    if (eventCount === 0) {
      const adminId = userIds['admin@opsdesk.local']!;
      await tx.assetEvent.create({
        data: { id: uuidv7(), assetId: asset.id, actorId: adminId, type: 'CREATED' },
      });
      if (assigneeId) {
        await tx.assetEvent.create({
          data: {
            id: uuidv7(),
            assetId: asset.id,
            actorId: adminId,
            type: 'ASSIGNED',
            metadata: { userId: assigneeId },
          },
        });
      }
    }

    const last = Number(s.tag.split('-')[1]);
    // Monotonic counter seeding: never move a counter backwards, and never below
    // the highest tag already present for the type (re-seeding must stay safe).
    await tx.$executeRaw`
      INSERT INTO asset_tag_counters (type_id, last)
      VALUES (
        ${typeByPrefix[s.prefix]!}::uuid,
        GREATEST(
          ${last},
          (SELECT COALESCE(MAX(CAST(SPLIT_PART(tag, '-', 2) AS INTEGER)), 0)
           FROM assets WHERE type_id = ${typeByPrefix[s.prefix]!}::uuid)
        )
      )
      ON CONFLICT (type_id) DO UPDATE
        SET last = GREATEST(asset_tag_counters.last, EXCLUDED.last)
    `;
  }
}

async function main() {
  await prisma.$transaction(async (tx) => {
    await seedPermissions(tx);
    await seedRoles(tx);
    await seedOrg(tx);
    const userIds = await seedUsers(tx);
    await seedCatalog(tx);
    await seedSla(tx);
    await seedServices(tx);
    await seedChangeRules(tx);
    await seedWorkflowTemplates(tx);
    await seedKnowledge(tx);
    await seedAssets(tx, userIds);
  });
  console.warn('Seed complete: roles, permissions, org, users, catalog, SLA, services, assets.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
