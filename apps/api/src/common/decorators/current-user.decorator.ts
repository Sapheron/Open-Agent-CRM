import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@wacrm/database';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
