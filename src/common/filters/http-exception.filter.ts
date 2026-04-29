import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { isRecord, isString, isStringArray } from '../utils/type-guards';

interface HttpExceptionResponseBody {
  code?: unknown;
  message?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (this.isHttpExceptionResponseBody(exceptionResponse)) {
        const res = exceptionResponse;
        const responseCode = isString(res.code) ? res.code : null;
        const responseMessage = res.message;

        code =
          responseCode ||
          (isStringArray(responseMessage) && status === HttpStatus.BAD_REQUEST
            ? 'VALIDATION_ERROR'
            : this.statusToCode(status));
        message = isStringArray(responseMessage)
          ? responseMessage.join(', ')
          : isString(responseMessage)
            ? responseMessage
            : exception.message;
      } else {
        code = this.statusToCode(status);
        message = isString(exceptionResponse)
          ? exceptionResponse
          : exception.message;
      }
    } else {
      this.logger.error('Unhandled exception', exception as Error);
    }

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }

  private isHttpExceptionResponseBody(
    value: unknown,
  ): value is HttpExceptionResponseBody {
    return isRecord(value);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return map[status] || 'INTERNAL_SERVER_ERROR';
  }
}
