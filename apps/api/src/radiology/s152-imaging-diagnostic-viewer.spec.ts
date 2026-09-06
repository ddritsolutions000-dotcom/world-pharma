/**
 * Sprint 152 — Diagnostic imaging viewer (unit).
 * Sandbox frames; auth fail-closed; no public URLs; production PACS EXTERNAL_GATED.
 */
import { ProblemException } from '../common/problem';
import {
  encodeGrayscalePng,
  renderSandboxDiagnosticFrame,
  SANDBOX_VIEWER_DEFAULT_FRAME_COUNT,
} from './sandbox-diagnostic-frame';
import {
  DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION,
  ImagingDiagnosticViewerService,
  NO_PRODUCTION_PACS_VIEWER,
} from './imaging-diagnostic-viewer.service';

describe('S152 sandbox diagnostic frames', () => {
  it('encodes valid PNG and renders deterministic phantoms', () => {
    const pixels = new Uint8Array(4);
    pixels[0] = 10;
    pixels[1] = 20;
    pixels[2] = 30;
    pixels[3] = 40;
    const png = encodeGrayscalePng(2, 2, pixels);
    expect(png[0]).toBe(137);
    expect(png.toString('ascii', 1, 4)).toBe('PNG');

    const a = renderSandboxDiagnosticFrame({
      studyId: '11111111-1111-1111-1111-111111111111',
      seriesId: '22222222-2222-2222-2222-222222222222',
      frameIndex: 0,
      frameCount: SANDBOX_VIEWER_DEFAULT_FRAME_COUNT,
      modalityCode: 'XR',
    });
    const b = renderSandboxDiagnosticFrame({
      studyId: '11111111-1111-1111-1111-111111111111',
      seriesId: '22222222-2222-2222-2222-222222222222',
      frameIndex: 0,
      frameCount: SANDBOX_VIEWER_DEFAULT_FRAME_COUNT,
      modalityCode: 'XR',
    });
    expect(a.png.equals(b.png)).toBe(true);
    expect(a.contentType).toBe('image/png');
    expect(a.width).toBe(512);

    const c = renderSandboxDiagnosticFrame({
      studyId: '11111111-1111-1111-1111-111111111111',
      seriesId: '22222222-2222-2222-2222-222222222222',
      frameIndex: 3,
      frameCount: SANDBOX_VIEWER_DEFAULT_FRAME_COUNT,
      modalityCode: 'XR',
    });
    expect(a.png.equals(c.png)).toBe(false);
  });

  it('documents workstation boundary and production blocker constants', () => {
    expect(NO_PRODUCTION_PACS_VIEWER).toBe('NO_PRODUCTION_PACS_VIEWER');
    expect(DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION).toBe(
      'DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION',
    );
    expect(ImagingDiagnosticViewerService.name).toBe('ImagingDiagnosticViewerService');
  });
});

describe('S152 viewer authorization contracts (pure)', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
  });

  it('buildCustomerViewerAvailability is false in production infrastructure', () => {
    process.env.INFRASTRUCTURE_ENVIRONMENT = 'production';
    const svc = Object.create(ImagingDiagnosticViewerService.prototype) as ImagingDiagnosticViewerService;
    const result = svc.buildCustomerViewerAvailability({
      sandbox: true,
      status: 'ACQUIRED' as never,
      series: [{ instances: [{ status: 'STORED' as never }] }],
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe(NO_PRODUCTION_PACS_VIEWER);
  });

  it('buildCustomerViewerAvailability true for sandbox stored instances outside production', () => {
    process.env.INFRASTRUCTURE_ENVIRONMENT = 'sandbox';
    const svc = Object.create(ImagingDiagnosticViewerService.prototype) as ImagingDiagnosticViewerService;
    const result = svc.buildCustomerViewerAvailability({
      sandbox: true,
      status: 'ACQUIRED' as never,
      series: [{ instances: [{ status: 'STORED' as never }] }],
    });
    expect(result.available).toBe(true);
    expect(result.certified_diagnostic_workstation).toBe(false);
  });

  it('missing study / empty series not viewable', () => {
    process.env.INFRASTRUCTURE_ENVIRONMENT = 'sandbox';
    const svc = Object.create(ImagingDiagnosticViewerService.prototype) as ImagingDiagnosticViewerService;
    const result = svc.buildCustomerViewerAvailability({
      sandbox: true,
      status: 'SCHEDULED' as never,
      series: [],
    });
    expect(result.available).toBe(false);
  });
});

describe('S152 ProblemException codes', () => {
  it('NO_PRODUCTION_PACS_VIEWER is a stable gate code', () => {
    const err = new ProblemException(
      503,
      NO_PRODUCTION_PACS_VIEWER,
      'Production PACS viewer EXTERNAL_GATED',
      'test',
    );
    expect(err.code).toBe(NO_PRODUCTION_PACS_VIEWER);
    expect(err.getStatus()).toBe(503);
  });
});
