import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { FavoritesService } from './favorites.service';

class AddFavoriteDto {
  @IsString()
  channelId!: string;
}

class ReorderFavoritesDto {
  @IsArray()
  @IsString({ each: true })
  channelIds!: string[];
}

@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les favoris' })
  findAll() {
    return this.favorites.findAll();
  }

  @Post()
  @ApiBody({ type: AddFavoriteDto })
  @ApiOperation({ summary: 'Ajouter un favori (id, slug ou identifiant iptv-org)' })
  add(@Body() dto: AddFavoriteDto) {
    return this.favorites.add(dto.channelId);
  }

  @Put('order')
  @ApiOperation({ summary: 'Réordonner les favoris' })
  reorder(@Body() dto: ReorderFavoritesDto) {
    return this.favorites.reorder(dto.channelIds);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Retirer un favori' })
  remove(@Param('id') id: string) {
    return this.favorites.remove(id);
  }
}
