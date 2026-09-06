/** PACS integration boundary — sandbox adapter uses LocalPrivateObjectStore; external C-STORE is EXTERNAL-GATED. */
export type IngestStudyInput = {
  imagingStudyId: string;
  imagingOrgId: string;
  countryId: string;
  studyInstanceUid: string;
  accessionNumber: string;
  modalityCode: string;
  studyDescription?: string | null;
  idempotencyKey: string;
  actorPersonId: string;
};

export type IngestedInstance = {
  sopInstanceUid: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
};

export type IngestedSeries = {
  seriesInstanceUid: string;
  modalityCode: string | null;
  description: string | null;
  instances: IngestedInstance[];
};

export type IngestStudyResult = {
  studyInstanceUid: string;
  series: IngestedSeries[];
  sandbox: true;
  storage: 'local_private_object_store';
  idempotent: boolean;
};

export const PACS_ADAPTER = Symbol('PACS_ADAPTER');

export abstract class PacsAdapter {
  abstract ingestStudy(input: IngestStudyInput): Promise<IngestStudyResult>;
}
