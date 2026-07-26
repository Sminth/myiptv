import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

/** `?hd=true` arrive en string : on convertit sans casser `undefined`. */
const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1';

const toUpperList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean)
    : value;

const toLowerList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
    : value;

export class QueryChannelsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche plein texte (nom, nom alternatif)', example: 'tf1' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Codes pays ISO, séparés par des virgules', example: 'FR,CI' })
  @Transform(toUpperList)
  @IsOptional()
  country?: string[];

  @ApiPropertyOptional({ description: 'Codes régions', example: 'AFR,EUR' })
  @Transform(toUpperList)
  @IsOptional()
  region?: string[];

  @ApiPropertyOptional({ description: 'Codes langue ISO 639-3', example: 'fra' })
  @Transform(toLowerList)
  @IsOptional()
  language?: string[];

  @ApiPropertyOptional({ description: 'Catégories iptv-org', example: 'news,documentary' })
  @Transform(toLowerList)
  @IsOptional()
  category?: string[];

  @ApiPropertyOptional({ description: 'Seulement HD (720p+)' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  hd?: boolean;

  @ApiPropertyOptional({ description: 'Seulement les chaînes avec un flux qui répond' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Seulement mes chaînes curées' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  wanted?: boolean;

  @ApiPropertyOptional({ description: 'Seulement les favoris' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  favorite?: boolean;

  @ApiPropertyOptional({ description: 'Inclure les chaînes désactivées manuellement' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  includeDisabled?: boolean;

  @ApiPropertyOptional({ enum: ['priority', 'name', 'country', 'recent'], default: 'priority' })
  @IsIn(['priority', 'name', 'country', 'recent'])
  @IsOptional()
  sort: 'priority' | 'name' | 'country' | 'recent' = 'priority';
}

export class SearchChannelsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Terme recherché', example: 'ivoire' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: 'news' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'fra' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: 'AFR' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ description: 'true = HD uniquement, false = SD uniquement' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  hd?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Exclure les chaînes sans flux' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
