-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('PASSWORD_RESET', 'INVITATION', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('INCIDENT', 'SERVICE_REQUEST', 'ACCESS_REQUEST', 'HARDWARE_REQUEST', 'SOFTWARE_REQUEST');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ESCALATED', 'RESOLVED', 'REOPENED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNED', 'COMMENT_ADDED', 'INTERNAL_NOTE_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'SLA_APPLIED', 'SLA_CHANGED', 'SLA_BREACHED', 'ASSET_LINKED', 'ASSET_UNLINKED', 'INCIDENT_LINKED', 'INCIDENT_UNLINKED', 'ARTICLE_LINKED', 'RESOLVED', 'REOPENED', 'CLOSED', 'CANCELLED', 'WATCHER_ADDED');

-- CreateEnum
CREATE TYPE "SlaTimerKind" AS ENUM ('RESPONSE', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "SlaState" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('STARTED', 'PAUSED', 'RESUMED', 'WARNING', 'ESCALATED', 'BREACHED', 'COMPLETED', 'RECALCULATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PROCURED', 'IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'LOST', 'RETIRED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AssetEventType" AS ENUM ('CREATED', 'RECEIVED', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNED', 'SENT_TO_REPAIR', 'RETURNED_FROM_REPAIR', 'MARKED_LOST', 'FOUND', 'RETIRED', 'DISPOSED', 'UPDATED', 'TICKET_LINKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_ASSIGNED', 'TICKET_STATUS_CHANGED', 'TICKET_COMMENT_ADDED', 'TICKET_RESOLVED', 'SLA_WARNING', 'SLA_ESCALATION', 'SLA_BREACHED', 'ASSET_ASSIGNED', 'ASSET_WARRANTY_EXPIRING', 'INCIDENT_DECLARED', 'INCIDENT_UPDATED', 'CHANGE_APPROVAL_REQUESTED', 'CHANGE_DECIDED', 'WORKFLOW_TASK_ASSIGNED', 'MENTION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30),
    "job_title" VARCHAR(120),
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "department_id" UUID,
    "manager_id" UUID,
    "email_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip" INET,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "head_id" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "email" CITEXT,
    "lead_id" UUID,
    "manager_id" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "default_team_id" UUID,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resolution_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "requested_priority" "Priority",
    "category_id" UUID,
    "subcategory_id" UUID,
    "requester_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "assignee_id" UUID,
    "team_id" UUID,
    "department_id" UUID,
    "asset_id" UUID,
    "sla_policy_id" UUID,
    "sla_state" "SlaState",
    "resolution_code_id" UUID,
    "resolution_summary" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "first_response_at" TIMESTAMPTZ,
    "due_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_watchers" (
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("ticket_id","user_id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "body" TEXT NOT NULL,
    "edited_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "comment_id" UUID,
    "uploaded_by_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "TicketEventType" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_calendars" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "is_24x7" BOOLEAN NOT NULL DEFAULT false,
    "schedule" JSONB NOT NULL,

    CONSTRAINT "business_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "priority" "Priority",
    "ticket_type" "TicketType",
    "category_id" UUID,
    "calendar_id" UUID NOT NULL,
    "first_response_minutes" INTEGER NOT NULL,
    "resolution_minutes" INTEGER NOT NULL,
    "warning_percent" INTEGER NOT NULL DEFAULT 75,
    "escalation_percent" INTEGER NOT NULL DEFAULT 90,
    "pause_on_statuses" "TicketStatus"[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_timers" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "kind" "SlaTimerKind" NOT NULL,
    "target_minutes" INTEGER NOT NULL,
    "state" "SlaState" NOT NULL DEFAULT 'ON_TRACK',
    "started_at" TIMESTAMPTZ NOT NULL,
    "warn_at" TIMESTAMPTZ NOT NULL,
    "escalate_at" TIMESTAMPTZ NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "paused_at" TIMESTAMPTZ,
    "paused_minutes" INTEGER NOT NULL DEFAULT 0,
    "warned_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "breached_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "is_current" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sla_timers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_events" (
    "id" UUID NOT NULL,
    "timer_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" "SlaEventType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "tag_prefix" VARCHAR(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contact" TEXT,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tag" VARCHAR(20) NOT NULL,
    "type_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "manufacturer" VARCHAR(100),
    "model" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "status" "AssetStatus" NOT NULL DEFAULT 'PROCURED',
    "purchase_date" DATE,
    "purchase_cost" DECIMAL(12,2),
    "warranty_expiry" DATE,
    "vendor_id" UUID,
    "location_id" UUID,
    "department_id" UUID,
    "current_assignee_id" UUID,
    "notes" TEXT,
    "disposal_method" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMPTZ,
    "returned_by_id" UUID,
    "return_condition" VARCHAR(50),
    "note" TEXT,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_events" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "AssetEventType" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" UUID,
    "link" VARCHAR(300),
    "read_at" TIMESTAMPTZ,
    "dedupe_key" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" CITEXT,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "entity_key" VARCHAR(30),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "request_id" VARCHAR(40),
    "ip" INET,
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "aggregate_type" VARCHAR(40) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_parent_id_name_key" ON "categories"("parent_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_codes_code_key" ON "resolution_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_key_key" ON "tickets"("key");

-- CreateIndex
CREATE INDEX "tickets_status_priority_idx" ON "tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "tickets_assignee_id_status_idx" ON "tickets"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "tickets_team_id_status_idx" ON "tickets"("team_id", "status");

-- CreateIndex
CREATE INDEX "tickets_requester_id_created_at_idx" ON "tickets"("requester_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tickets_category_id_idx" ON "tickets"("category_id");

-- CreateIndex
CREATE INDEX "tickets_department_id_idx" ON "tickets"("department_id");

-- CreateIndex
CREATE INDEX "tickets_asset_id_idx" ON "tickets"("asset_id");

-- CreateIndex
CREATE INDEX "tickets_sla_state_idx" ON "tickets"("sla_state");

-- CreateIndex
CREATE INDEX "tickets_due_at_idx" ON "tickets"("due_at");

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ticket_watchers_user_id_idx" ON "ticket_watchers"("user_id");

-- CreateIndex
CREATE INDEX "ticket_comments_ticket_id_created_at_idx" ON "ticket_comments"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_attachments_storage_key_key" ON "ticket_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_events_type_created_at_idx" ON "ticket_events"("type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_calendars_name_key" ON "business_calendars"("name");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_calendar_id_date_key" ON "holidays"("calendar_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_name_key" ON "sla_policies"("name");

-- CreateIndex
CREATE INDEX "sla_policies_is_active_priority_idx" ON "sla_policies"("is_active", "priority");

-- CreateIndex
CREATE INDEX "sla_timers_ticket_id_idx" ON "sla_timers"("ticket_id");

-- CreateIndex
CREATE INDEX "sla_events_ticket_id_created_at_idx" ON "sla_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "sla_events_type_created_at_idx" ON "sla_events"("type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_name_key" ON "asset_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_tag_prefix_key" ON "asset_types"("tag_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tag_key" ON "assets"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serial_number_key" ON "assets"("serial_number");

-- CreateIndex
CREATE INDEX "assets_type_id_status_idx" ON "assets"("type_id", "status");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_department_id_idx" ON "assets"("department_id");

-- CreateIndex
CREATE INDEX "assets_current_assignee_id_idx" ON "assets"("current_assignee_id");

-- CreateIndex
CREATE INDEX "assets_warranty_expiry_idx" ON "assets"("warranty_expiry");

-- CreateIndex
CREATE INDEX "assets_location_id_idx" ON "assets"("location_id");

-- CreateIndex
CREATE INDEX "asset_assignments_asset_id_assigned_at_idx" ON "asset_assignments"("asset_id", "assigned_at" DESC);

-- CreateIndex
CREATE INDEX "asset_assignments_user_id_idx" ON "asset_assignments"("user_id");

-- CreateIndex
CREATE INDEX "asset_events_asset_id_created_at_idx" ON "asset_events"("asset_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_dedupe_key_key" ON "notifications"("recipient_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "ticket_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "business_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "business_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_timers" ADD CONSTRAINT "sla_timers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_timer_id_fkey" FOREIGN KEY ("timer_id") REFERENCES "sla_timers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "asset_tag_counters" (
    "type_id" UUID NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_tag_counters_pkey" PRIMARY KEY ("type_id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Integrity rules not expressible in Prisma (Backend Schema §5)
-- ponytail: dev DB connects as the owner role; least-privilege opsdesk_app role
-- separation is deferred to deployment hardening. Triggers enforce immutability.
-- ─────────────────────────────────────────────────────────────────────────────

-- Human-key sequence for tickets (TKT-000001)
CREATE SEQUENCE ticket_key_seq START 1;

-- One active assignment per asset (AST-4 / BR-4)
CREATE UNIQUE INDEX asset_assignments_one_active
  ON asset_assignments (asset_id) WHERE returned_at IS NULL;

-- Assets in terminal-ish states cannot have an active assignment (AST-5)
CREATE FUNCTION asset_assignment_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.returned_at IS NULL AND EXISTS (
       SELECT 1 FROM assets a WHERE a.id = NEW.asset_id AND a.status IN ('RETIRED','DISPOSED','LOST')) THEN
    RAISE EXCEPTION 'ASSET_NOT_ASSIGNABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_assignment_status_guard
  BEFORE INSERT OR UPDATE ON asset_assignments
  FOR EACH ROW EXECUTE FUNCTION asset_assignment_status_guard();

-- assigned status <=> current assignee consistency
ALTER TABLE assets ADD CONSTRAINT assets_assignee_status_ck
  CHECK ((status = 'ASSIGNED') = (current_assignee_id IS NOT NULL)
         OR (status = 'IN_REPAIR'));

-- One current SLA timer per kind per ticket
CREATE UNIQUE INDEX sla_timers_one_current
  ON sla_timers (ticket_id, kind) WHERE is_current;

-- Evaluator scan indexes
CREATE INDEX sla_timers_due_scan   ON sla_timers (due_at)      WHERE completed_at IS NULL AND paused_at IS NULL AND breached_at  IS NULL AND is_current;
CREATE INDEX sla_timers_warn_scan  ON sla_timers (warn_at)     WHERE completed_at IS NULL AND paused_at IS NULL AND warned_at    IS NULL AND is_current;
CREATE INDEX sla_timers_esc_scan   ON sla_timers (escalate_at) WHERE completed_at IS NULL AND paused_at IS NULL AND escalated_at IS NULL AND is_current;

-- SLA policy sanity
ALTER TABLE sla_policies ADD CONSTRAINT sla_policies_targets_ck
  CHECK (first_response_minutes > 0 AND resolution_minutes >= first_response_minutes
         AND warning_percent BETWEEN 1 AND 99 AND escalation_percent BETWEEN warning_percent AND 99);
CREATE UNIQUE INDEX sla_policies_single_default ON sla_policies ((is_default)) WHERE is_default;

-- Ticket field consistency
ALTER TABLE tickets ADD CONSTRAINT tickets_resolved_ck
  CHECK (status NOT IN ('RESOLVED','CLOSED') OR resolved_at IS NOT NULL);
ALTER TABLE tickets ADD CONSTRAINT tickets_title_len_ck CHECK (char_length(title) BETWEEN 5 AND 200);

-- Full-text + trigram search.
-- ponytail: expression index instead of a stored search_vector column — Prisma 6
-- cannot model generated columns and flags them as drift. The query side uses the
-- same to_tsvector expression, so behavior is equivalent.
CREATE INDEX tickets_search_gin ON tickets USING gin
  ((setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B')));
CREATE INDEX tickets_title_trgm ON tickets USING gin (title gin_trgm_ops);
CREATE INDEX assets_name_trgm   ON assets  USING gin (name gin_trgm_ops);
CREATE INDEX assets_serial_trgm ON assets  USING gin (serial_number gin_trgm_ops);
CREATE INDEX users_name_trgm    ON users   USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Unread notifications
CREATE INDEX notifications_unread ON notifications (recipient_id) WHERE read_at IS NULL;

-- Outbox pending
CREATE INDEX outbox_pending ON outbox_events (created_at) WHERE processed_at IS NULL;

-- Append-only history tables (AUD-3, BR-7)
CREATE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER trg_ticket_events_append_only BEFORE UPDATE OR DELETE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER trg_sla_events_append_only BEFORE UPDATE OR DELETE ON sla_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER trg_asset_events_append_only BEFORE UPDATE OR DELETE ON asset_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
