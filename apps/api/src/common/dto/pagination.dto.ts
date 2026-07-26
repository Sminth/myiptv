import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page (1-indexée)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit = 50;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export class PaginatedDto<T> {
  @ApiProperty({ isArray: true })
  data!: T[];

  @ApiProperty({ example: { total: 1234, page: 1, limit: 50, pages: 25 } })
  meta!: { total: number; page: number; limit: number; pages: number };

  static of<T>(data: T[], total: number, page: number, limit: number): PaginatedDto<T> {
    return {
      data,
      meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
