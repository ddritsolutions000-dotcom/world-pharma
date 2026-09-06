import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map } from 'rxjs';
import { jsonSafe } from './money';

@Injectable()
export class BigIntJsonInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        // Preserve binary downloads (DICOM viewer frames, help media, etc.).
        if (data instanceof StreamableFile) {
          return data;
        }
        return jsonSafe(data);
      }),
    );
  }
}
