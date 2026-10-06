-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500),
    "content" TEXT NOT NULL,
    "category_id" UUID,
    "author_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_articles" (
    "ticket_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_articles_pkey" PRIMARY KEY ("ticket_id","article_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_category_id_idx" ON "knowledge_articles"("status", "category_id");

-- AddForeignKey
ALTER TABLE "ticket_articles" ADD CONSTRAINT "ticket_articles_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_articles" ADD CONSTRAINT "ticket_articles_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- KB full-text search (expression index; Prisma cannot model generated columns)
CREATE INDEX kb_search_gin ON knowledge_articles USING gin (
  (setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
   setweight(to_tsvector('english', coalesce(summary,'')), 'B') ||
   setweight(to_tsvector('english', coalesce(content,'')), 'C')));
