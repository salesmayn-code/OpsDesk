-- CreateEnum
CREATE TYPE "WorkflowKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" UUID NOT NULL,
    "kind" "WorkflowKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "department_id" UUID,
    "tasks" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_requests" (
    "id" UUID NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "kind" "WorkflowKind" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'OPEN',
    "subject_user_id" UUID NOT NULL,
    "manager_id" UUID,
    "department_id" UUID,
    "template_id" UUID,
    "effective_date" DATE NOT NULL,
    "notes" TEXT,
    "disable_account_on_complete" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tasks" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID,
    "owner_team_id" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "asset_id" UUID,
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ,
    "completed_by_id" UUID,
    "skip_reason" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_kind_name_key" ON "workflow_templates"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_requests_key_key" ON "workflow_requests"("key");

-- CreateIndex
CREATE INDEX "workflow_requests_kind_status_idx" ON "workflow_requests"("kind", "status");

-- CreateIndex
CREATE INDEX "workflow_requests_subject_user_id_idx" ON "workflow_requests"("subject_user_id");

-- CreateIndex
CREATE INDEX "workflow_tasks_request_id_sort_order_idx" ON "workflow_tasks"("request_id", "sort_order");

-- CreateIndex
CREATE INDEX "workflow_tasks_owner_user_id_status_idx" ON "workflow_tasks"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_owner_team_id_status_idx" ON "workflow_tasks"("owner_team_id", "status");

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Human-key sequence for workflow requests (ONB-000045 / OFF-000012)
CREATE SEQUENCE workflow_key_seq START 1;
