import { Injectable } from '@nestjs/common';
import type {
  CreateAssetTypeInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@opsdesk/contracts';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { errors } from '../../common/errors';

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  defaultTeamId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  children: CategoryNode[];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async categoryTree(includeInactive: boolean) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const nodes = new Map<string, CategoryNode>(
      categories.map((category) => [
        category.id,
        {
          id: category.id,
          name: category.name,
          parentId: category.parentId,
          defaultTeamId: category.defaultTeamId,
          description: category.description,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          children: [],
        },
      ]),
    );

    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  listResolutionCodes() {
    return this.prisma.resolutionCode.findMany({
      where: { isActive: true },
      orderBy: { label: 'asc' },
    });
  }

  listAssetTypes() {
    return this.prisma.assetType.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(input: CreateCategoryInput, actorId: string) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.category.findUnique({ where: { id: input.parentId } });
        if (!parent) throw errors.notFound('CATEGORY_NOT_FOUND', 'Parent category not found.');
      }
      await tx.category.create({
        data: {
          id,
          name: input.name,
          parentId: input.parentId ?? null,
          defaultTeamId: input.defaultTeamId ?? null,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await this.audit.record(tx, {
        action: 'category.created',
        entityType: 'category',
        entityId: id,
        after: { name: input.name, parentId: input.parentId ?? null },
        actorId,
      });
    });
    return { data: await this.prisma.category.findUniqueOrThrow({ where: { id } }) };
  }

  async updateCategory(id: string, input: UpdateCategoryInput, actorId: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw errors.notFound('CATEGORY_NOT_FOUND', 'Category not found.');
    if (input.parentId === id) {
      throw errors.businessRule('VALIDATION_FAILED', 'A category cannot be its own parent.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.defaultTeamId !== undefined ? { defaultTeamId: input.defaultTeamId } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'category.updated',
        entityType: 'category',
        entityId: id,
        before: { name: category.name, isActive: category.isActive },
        after: input as Record<string, unknown>,
        actorId,
      });
    });
    return { data: await this.prisma.category.findUniqueOrThrow({ where: { id } }) };
  }

  async createAssetType(input: CreateAssetTypeInput, actorId: string) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.assetType.create({
        data: { id, name: input.name, tagPrefix: input.tagPrefix },
      });
      await this.audit.record(tx, {
        action: 'asset_type.created',
        entityType: 'asset_type',
        entityId: id,
        after: { name: input.name, tagPrefix: input.tagPrefix },
        actorId,
      });
    });
    return { data: await this.prisma.assetType.findUniqueOrThrow({ where: { id } }) };
  }
}
