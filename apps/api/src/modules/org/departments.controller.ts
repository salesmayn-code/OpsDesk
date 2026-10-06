import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CreateDepartmentDto, UpdateDepartmentDto } from './org.dto';
import { OrgService } from './org.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('user:view')
  list() {
    return this.orgService.listDepartments();
  }

  @Post()
  @RequirePermissions('department:manage')
  create(@Body() body: CreateDepartmentDto) {
    return this.orgService.createDepartment(body);
  }

  @Patch(':id')
  @RequirePermissions('department:manage')
  update(@Param('id') id: string, @Body() body: UpdateDepartmentDto) {
    return this.orgService.updateDepartment(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('department:manage')
  async remove(@Param('id') id: string) {
    await this.orgService.deleteDepartment(id);
  }
}
