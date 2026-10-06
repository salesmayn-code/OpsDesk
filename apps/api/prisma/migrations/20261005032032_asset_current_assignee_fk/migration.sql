-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_current_assignee_id_fkey" FOREIGN KEY ("current_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
