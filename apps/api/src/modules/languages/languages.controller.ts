import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LanguagesService } from './languages.service';

@ApiTags('reference')
@Controller('languages')
export class LanguagesController {
  constructor(private readonly languages: LanguagesService) {}

  @Get()
  @ApiQuery({ name: 'all', required: false, description: 'true = inclure les langues sans chaîne' })
  @ApiOperation({ summary: 'Lister les langues' })
  findAll(@Query('all') all?: string) {
    return this.languages.findAll(all !== 'true');
  }

  @Get(':code')
  @ApiOperation({ summary: 'Détail d’une langue' })
  findOne(@Param('code') code: string) {
    return this.languages.findOne(code);
  }
}
