-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('SEV1', 'SEV2', 'SEV3', 'SEV4');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('IDENTIFIED', 'INVESTIGATING', 'ESCALATED', 'MITIGATING', 'MONITORING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentEventType" AS ENUM ('NOTE', 'STATUS_CHANGED', 'SEVERITY_CHANGED', 'OWNER_CHANGED', 'COMMANDER_CHANGED', 'TICKET_LINKED', 'TICKET_UNLINKED', 'MITIGATION', 'ROOT_CAUSE', 'COMMUNICATION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PostmortemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "owner_team_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_key_counters" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "incident_key_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "service_id" UUID,
    "impact" TEXT,
    "owner_id" UUID,
    "commander_id" UUID,
    "team_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL,
    "mitigated_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "detection_method" VARCHAR(100),
    "root_cause" TEXT,
    "mitigation" TEXT,
    "resolution" TEXT,
    "preventive_action" TEXT,
    "declared_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "IncidentEventType" NOT NULL,
    "body" TEXT,
    "from_value" TEXT,
    "to_value" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "corrects_event_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_tickets" (
    "incident_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_tickets_pkey" PRIMARY KEY ("incident_id","ticket_id")
);

-- CreateTable
CREATE TABLE "postmortems" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "status" "PostmortemStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "impact" TEXT,
    "timeline_summary" TEXT,
    "root_cause" TEXT,
    "contributing_factors" TEXT,
    "went_well" TEXT,
    "went_wrong" TEXT,
    "owner_id" UUID,
    "published_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "postmortems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postmortem_actions" (
    "id" UUID NOT NULL,
    "postmortem_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "owner_id" UUID,
    "due_date" DATE,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "postmortem_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_name_key" ON "services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_key_key" ON "incidents"("key");

-- CreateIndex
CREATE INDEX "incidents_status_severity_idx" ON "incidents"("status", "severity");

-- CreateIndex
CREATE INDEX "incidents_service_id_idx" ON "incidents"("service_id");

-- CreateIndex
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at" DESC);

-- CreateIndex
CREATE INDEX "incident_events_incident_id_occurred_at_idx" ON "incident_events"("incident_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "incident_tickets_ticket_id_key" ON "incident_tickets"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "postmortems_incident_id_key" ON "postmortems"("incident_id");

-- CreateIndex
CREATE INDEX "postmortem_actions_owner_id_status_idx" ON "postmortem_actions"("owner_id", "status");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_tickets" ADD CONSTRAINT "incident_tickets_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_tickets" ADD CONSTRAINT "incident_tickets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_actions" ADD CONSTRAINT "postmortem_actions_postmortem_id_fkey" FOREIGN KEY ("postmortem_id") REFERENCES "postmortems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only incident timeline (Backend Schema §5)
CREATE TRIGGER trg_incident_events_append_only BEFORE UPDATE OR DELETE ON incident_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
