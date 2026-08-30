import { HealthArtifactType } from '@prisma/client';
import {
  consentScopeIncludes,
  isArtifactReadPurpose,
  normalizeConsentScopeInput,
  parseConsentScope,
} from './consent-scope';

describe('consent-scope', () => {
  it('defaults empty scope to lab, imaging, and prescription artifact types', () => {
    expect(parseConsentScope([])).toEqual([
      HealthArtifactType.LAB_REPORT,
      HealthArtifactType.IMAGING_REPORT,
      HealthArtifactType.PRESCRIPTION_STRUCTURED,
    ]);
    expect(normalizeConsentScopeInput()).toEqual([
      HealthArtifactType.LAB_REPORT,
      HealthArtifactType.IMAGING_REPORT,
      HealthArtifactType.PRESCRIPTION_STRUCTURED,
    ]);
  });

  it('validates scope membership for artifact reads', () => {
    expect(
      consentScopeIncludes(['LAB_REPORT'], HealthArtifactType.LAB_REPORT),
    ).toBe(true);
    expect(
      consentScopeIncludes(['IMAGING_REPORT'], HealthArtifactType.LAB_REPORT),
    ).toBe(false);
  });

  it('allows only consultation and treatment for artifact payload reads', () => {
    expect(isArtifactReadPurpose('consultation')).toBe(true);
    expect(isArtifactReadPurpose('treatment')).toBe(true);
    expect(isArtifactReadPurpose('telemedicine')).toBe(false);
  });
});
