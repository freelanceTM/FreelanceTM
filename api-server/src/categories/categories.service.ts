import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: list all active categories, ordered by gig count (most popular first). */
  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { gigCount: 'desc' },
    });
  }

  /** Public: get a single category by slug (used for category landing pages). */
  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException(`Category '${slug}' not found`);
    return category;
  }

  /** Admin: create a new category. */
  async create(data: {
    name: string;
    slug: string;
    description?: string;
    icon?: string;
  }) {
    const existing = await this.prisma.category.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictException(`Category with slug '${data.slug}' already exists`);

    return this.prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        icon: data.icon,
        gigCount: 0,
      },
    });
  }

  /** Admin: update a category's metadata. */
  async update(
    id: number,
    data: { name?: string; description?: string; icon?: string },
  ) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.category.update({
      where: { id },
      data,
    });
  }
}
