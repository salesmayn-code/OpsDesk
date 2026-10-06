import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(
    @CurrentUser() actor: AuthUser,
    @Query('q') q?: string,
    @Query('types') types?: string,
  ) {
    return this.search.search(q ?? '', types ? types.split(',').map((t) => t.trim()) : undefined, actor);
  }
}
