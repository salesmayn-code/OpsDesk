import {
  articleQuerySchema,
  articleTransitionSchema,
  createArticleSchema,
  linkArticleSchema,
  updateArticleSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class ArticleQueryDto extends createZodDto(articleQuerySchema) {}
export class CreateArticleDto extends createZodDto(createArticleSchema) {}
export class UpdateArticleDto extends createZodDto(updateArticleSchema) {}
export class ArticleTransitionDto extends createZodDto(articleTransitionSchema) {}
export class LinkArticleDto extends createZodDto(linkArticleSchema) {}
