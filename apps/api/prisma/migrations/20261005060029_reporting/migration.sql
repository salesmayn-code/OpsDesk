-- CreateTable
CREATE TABLE "daily_ticket_stats" (
    "day" DATE NOT NULL,
    "team_id" UUID NOT NULL,
    "priority" "Priority" NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "breached_response" INTEGER NOT NULL DEFAULT 0,
    "breached_resolution" INTEGER NOT NULL DEFAULT 0,
    "sum_first_response_minutes" INTEGER NOT NULL DEFAULT 0,
    "sum_resolution_minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_ticket_stats_pkey" PRIMARY KEY ("day","team_id","priority")
);
