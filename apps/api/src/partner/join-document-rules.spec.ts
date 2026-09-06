import { KycDocumentStatus } from '@prisma/client';
import {
  assertKycBytesMatchContentType,
  isAllowedJoinDocumentTypeCode,
  missingRequiredDocuments,
} from './join-document-rules';

describe('join-document-rules', () => {
  it('allowlists policy required types and rejects unknown codes', () => {
    expect(isAllowedJoinDocumentTypeCode('BUSINESS_REGISTRATION', ['BUSINESS_REGISTRATION']).ok).toBe(
      true,
    );
    expect(isAllowedJoinDocumentTypeCode('license', ['BUSINESS_REGISTRATION']).ok).toBe(true);
    expect(isAllowedJoinDocumentTypeCode('RANDOM_JUNK', ['BUSINESS_REGISTRATION']).ok).toBe(false);
    expect(isAllowedJoinDocumentTypeCode('x', []).ok).toBe(false);
  });

  it('submit accepts UPLOADED; activate requires VERIFIED; ignores RETIRED/REJECTED', () => {
    const docs = [
      { documentTypeCode: 'BUSINESS_REGISTRATION', status: KycDocumentStatus.RETIRED },
      { documentTypeCode: 'BUSINESS_REGISTRATION', status: KycDocumentStatus.UPLOADED },
    ];
    expect(missingRequiredDocuments(['BUSINESS_REGISTRATION'], docs, 'submit')).toEqual([]);
    expect(missingRequiredDocuments(['BUSINESS_REGISTRATION'], docs, 'activate')).toEqual([
      'BUSINESS_REGISTRATION',
    ]);

    const verified = [
      { documentTypeCode: 'BUSINESS_REGISTRATION', status: KycDocumentStatus.VERIFIED },
    ];
    expect(missingRequiredDocuments(['BUSINESS_REGISTRATION'], verified, 'activate')).toEqual([]);

    const rejectedOnly = [
      { documentTypeCode: 'BUSINESS_REGISTRATION', status: KycDocumentStatus.REJECTED },
    ];
    expect(missingRequiredDocuments(['BUSINESS_REGISTRATION'], rejectedOnly, 'submit')).toEqual([
      'BUSINESS_REGISTRATION',
    ]);
  });

  it('sniffs pdf/jpeg/png magic bytes', () => {
    expect(() => assertKycBytesMatchContentType(Buffer.from('%PDF-1.4 x'), 'application/pdf')).not.toThrow();
    expect(() => assertKycBytesMatchContentType(Buffer.from('not-pdf'), 'application/pdf')).toThrow(
      /pdf_magic/,
    );
    expect(() =>
      assertKycBytesMatchContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).not.toThrow();
    expect(() =>
      assertKycBytesMatchContentType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png',
      ),
    ).not.toThrow();
  });
});
