import * as healthApi from './health-api';
import { performHealthDocumentUpload } from './health-upload-flow';
import {
  assertUploadResponseSafe,
  buildHealthUploadRequestBody,
  formatHealthUploadError,
  HEALTH_UPLOAD_BUTTON_LABEL,
  inferUploadArtifactType,
  prependUploadTimelineItem,
  timelineItemFromUploadResponse,
  validateHealthUploadFile,
} from './health-upload-utils';

jest.mock('./health-api');

const mockUpload = healthApi.uploadHealthDocument as jest.MockedFunction<typeof healthApi.uploadHealthDocument>;

describe('mobile health upload parity', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it('exposes the health upload entry label used by HealthHomeScreen', () => {
    expect(HEALTH_UPLOAD_BUTTON_LABEL).toBe('Upload health document');
  });

  it('allows health-home navigation surface for authenticated customers', async () => {
    const { resolveMobileScreen } = await import('./navigation');
    expect(
      resolveMobileScreen(
        { status: 'authenticated', audience: 'customer', permissions: [] } as never,
        'health-home',
      ),
    ).toBe('health-home');
  });

  it('validates accepted MIME types and size before upload', () => {
    expect(validateHealthUploadFile('application/pdf', 1024).ok).toBe(true);
    expect(validateHealthUploadFile('text/plain', 1024).ok).toBe(false);
    expect(validateHealthUploadFile('application/pdf', 11 * 1024 * 1024).ok).toBe(false);
  });

  it('builds the existing POST /health/uploads contract', () => {
    const body = buildHealthUploadRequestBody({
      countryCode: 'XX',
      file: {
        name: 'blood-work.pdf',
        mimeType: 'application/pdf',
        size: 128,
        base64: 'cGRm',
      },
    });
    expect(body).toEqual({
      country_code: 'XX',
      artifact_type: 'DOCUMENT',
      original_name: 'blood-work.pdf',
      content_type: 'application/pdf',
      content_base64: 'cGRm',
      title: undefined,
      idempotency_key: 'blood-work.pdf-128',
    });
    expect(inferUploadArtifactType('rx-scan.jpg')).toBe('PRESCRIPTION_UPLOAD');
  });

  it('uploads via HealthUploadService API and refreshes timeline preview', async () => {
    mockUpload.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        artifact_id: 'art-1',
        artifact_type: 'DOCUMENT',
        title: 'Blood work scan',
        published_at: '2026-08-30T12:00:00.000Z',
        timeline_event_id: 'evt-1',
        content_type: 'application/pdf',
        byte_size: 128,
        sandbox: true,
      },
    });

    const result = await performHealthDocumentUpload({
      token: 'token',
      countryCode: 'XX',
      file: {
        name: 'blood-work.pdf',
        mimeType: 'application/pdf',
        size: 128,
        base64: 'cGRm',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected upload success');
    }
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: 'DOCUMENT',
        originalName: 'blood-work.pdf',
        contentType: 'application/pdf',
        contentBase64: 'cGRm',
        countryCode: 'XX',
      }),
    );

    const preview = timelineItemFromUploadResponse(result.data);
    const merged = prependUploadTimelineItem([], preview);
    expect(merged[0]?.event_type).toBe('ARTIFACT_UPLOADED');
    expect(merged[0]?.artifact_id).toBe('art-1');
  });

  it('surfaces backend validation errors safely', async () => {
    mockUpload.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'Unsupported document type',
      kind: 'error',
    });

    const result = await performHealthDocumentUpload({
      token: 'token',
      countryCode: 'XX',
      file: {
        name: 'notes.txt',
        mimeType: 'application/pdf',
        size: 10,
        base64: 'dGV4dA==',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(formatHealthUploadError(result.error)).toMatch(/PDF, JPEG, and PNG/i);
    }
  });

  it('follows unauthorized mobile behavior on 401', async () => {
    const onUnauthorized = jest.fn();
    mockUpload.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Session expired.',
      kind: 'unauthorized',
    });

    const result = await performHealthDocumentUpload({
      token: 'token',
      countryCode: 'XX',
      onUnauthorized,
      file: {
        name: 'blood-work.pdf',
        mimeType: 'application/pdf',
        size: 128,
        base64: 'cGRm',
      },
    });

    expect(result.ok).toBe(false);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not expose object keys or storage metadata in upload responses', () => {
    expect(() =>
      assertUploadResponseSafe({
        artifact_id: 'art-1',
        artifact_type: 'DOCUMENT',
        title: 'Blood work scan',
        published_at: '2026-08-30T12:00:00.000Z',
        timeline_event_id: 'evt-1',
        content_type: 'application/pdf',
        byte_size: 128,
        sandbox: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertUploadResponseSafe({
        artifact_id: 'art-1',
        object_key: 'health-uploads/person/secret',
      }),
    ).toThrow(/object_key/);
  });
});
