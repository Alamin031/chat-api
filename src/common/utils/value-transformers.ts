import type { TransformFnParams } from 'class-transformer';

export function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
