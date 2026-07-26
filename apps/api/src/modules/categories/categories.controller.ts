import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('reference')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Catégories iptv-org avec volumétrie' })
  findAll() {
    return this.categories.findAll();
  }

  @Get('groups')
  @ApiOperation({ summary: 'Groupes de playlist (France, Côte d’Ivoire, Documentaire…)' })
  groups() {
    return this.categories.groups();
  }
}
