import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArticleQueryDto,
  ArticleTransitionDto,
  CreateArticleDto,
  LinkArticleDto,
  UpdateArticleDto,
} from './knowledge.dto';
import { KnowledgeService } from './knowledge.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('kb/articles')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequirePermissions('kb:view')
  list(@Query() query: ArticleQueryDto, @CurrentUser() actor: AuthUser) {
    return this.knowledge.list(query, actor);
  }

  @Post()
  @RequirePermissions('kb:create')
  create(@Body() body: CreateArticleDto, @CurrentUser() actor: AuthUser) {
    return this.knowledge.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('kb:view')
  getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.knowledge.getByIdOrSlug(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('kb:create')
  update(@Param('id') id: string, @Body() body: UpdateArticleDto, @CurrentUser() actor: AuthUser) {
    return this.knowledge.update(id, body, actor);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @RequirePermissions('kb:view')
  transition(
    @Param('id') id: string,
    @Body() body: ArticleTransitionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.knowledge.transition(id, body, actor);
  }
}

@Controller('kb/suggest')
export class KnowledgeSuggestController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequirePermissions('kb:view')
  suggest(@Query('q') q?: string, @Query('categoryId') categoryId?: string) {
    return this.knowledge.suggest(q, categoryId);
  }
}

@Controller('tickets/:id/articles')
export class TicketArticlesController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequirePermissions('ticket:view')
  list(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.knowledge.listForTicket(id, actor);
  }

  @Post()
  @RequirePermissions('ticket:view')
  link(@Param('id') id: string, @Body() body: LinkArticleDto, @CurrentUser() actor: AuthUser) {
    return this.knowledge.linkToTicket(id, body.articleId, actor);
  }
}
