import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { TeamsController } from './teams.controller';
import { OrgService } from './org.service';

@Module({
  controllers: [DepartmentsController, TeamsController],
  providers: [OrgService],
})
export class OrgModule {}
