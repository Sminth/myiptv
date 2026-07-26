import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CountriesService } from './countries.service';

@ApiTags('reference')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  @ApiQuery({ name: 'all', required: false, description: 'true = inclure les pays sans chaîne' })
  @ApiOperation({ summary: 'Lister les pays' })
  findAll(@Query('all') all?: string) {
    return this.countries.findAll(all !== 'true');
  }

  @Get(':code')
  @ApiOperation({ summary: 'Détail d’un pays' })
  findOne(@Param('code') code: string) {
    return this.countries.findOne(code);
  }
}
