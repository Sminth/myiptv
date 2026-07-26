import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegionsService } from './regions.service';

@ApiTags('reference')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les régions (AFR, EUR…)' })
  findAll() {
    return this.regions.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Détail d’une région' })
  findOne(@Param('code') code: string) {
    return this.regions.findOne(code);
  }
}
