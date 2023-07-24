import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { UserFeedDisabledCode } from "../types";

export enum GetUserFeedsInputSortKey {
  CreatedAtAscending = "createdAt",
  CreatedAtDescending = "-createdAt",
  TitleAscending = "title",
  TitleDescending = "-title",
  UrlAscending = "url",
  UrlDescending = "-url",
}

export class GetUserFeedsInputFiltersDto {
  @IsArray()
  @IsOptional()
  @IsIn([...Object.values(UserFeedDisabledCode), ""], { each: true })
  @Transform(({ value }) => (value ? value.split(",") : undefined))
  disabledCodes?: (UserFeedDisabledCode | "")[];
}

export class GetUserFeedsInputDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  limit: number;

  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  offset: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  @IsEnum(GetUserFeedsInputSortKey)
  @ValidateIf((v) => {
    return !!v.sort;
  })
  sort = GetUserFeedsInputSortKey.CreatedAtDescending;

  @IsOptional()
  @IsObject()
  @Type(() => GetUserFeedsInputFiltersDto)
  @ValidateNested()
  filters?: GetUserFeedsInputFiltersDto;
}
