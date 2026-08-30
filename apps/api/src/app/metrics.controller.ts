import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../common/metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  collect(): string {
    return this.metricsService.renderPrometheus();
  }
}
