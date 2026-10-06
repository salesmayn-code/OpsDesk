-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ChangeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'IMPLEMENTING', 'VALIDATING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_CHANGES');

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ChangeType" NOT NULL,
    "risk" "ChangeRisk" NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "requester_id" UUID NOT NULL,
    "owner_id" UUID,
    "team_id" UUID,
    "incident_id" UUID,
    "scheduled_start" TIMESTAMPTZ,
    "scheduled_end" TIMESTAMPTZ,
    "actual_start" TIMESTAMPTZ,
    "actual_end" TIMESTAMPTZ,
    "implementation_plan" TEXT,
    "validation_plan" TEXT,
    "rollback_plan" TEXT,
    "impact_analysis" TEXT,
    "outcome_notes" TEXT,
    "approval_round" INTEGER NOT NULL DEFAULT 1,
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "requires_admin_approval" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_services" (
    "change_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "change_services_pkey" PRIMARY KEY ("change_id","service_id")
);

-- CreateTable
CREATE TABLE "change_approval_rules" (
    "id" UUID NOT NULL,
    "type" "ChangeType" NOT NULL,
    "risk" "ChangeRisk" NOT NULL,
    "required_approvals" INTEGER NOT NULL,
    "approver_role_key" VARCHAR(50) NOT NULL,
    "requires_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "change_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_approvals" (
    "id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_events" (
    "id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "change_requests_key_key" ON "change_requests"("key");

-- CreateIndex
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");

-- CreateIndex
CREATE INDEX "change_requests_scheduled_start_scheduled_end_idx" ON "change_requests"("scheduled_start", "scheduled_end");

-- CreateIndex
CREATE INDEX "change_requests_requester_id_idx" ON "change_requests"("requester_id");

-- CreateIndex
CREATE UNIQUE INDEX "change_approval_rules_type_risk_key" ON "change_approval_rules"("type", "risk");

-- CreateIndex
CREATE INDEX "change_approvals_approver_id_idx" ON "change_approvals"("approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "change_approvals_change_id_approver_id_round_key" ON "change_approvals"("change_id", "approver_id", "round");

-- CreateIndex
CREATE INDEX "change_events_change_id_created_at_idx" ON "change_events"("change_id", "created_at");

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_services" ADD CONSTRAINT "change_services_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_services" ADD CONSTRAINT "change_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Human-key sequence for changes (CHG-000123)
CREATE SEQUENCE change_key_seq START 1;

-- Schedule sanity (Backend Schema §5)
ALTER TABLE change_requests ADD CONSTRAINT change_schedule_ck
  CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start);

-- Append-only approvals and history
CREATE TRIGGER trg_change_approvals_append_only BEFORE UPDATE OR DELETE ON change_approvals
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER trg_change_events_append_only BEFORE UPDATE OR DELETE ON change_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
