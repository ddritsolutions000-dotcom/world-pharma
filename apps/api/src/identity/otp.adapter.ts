export interface OtpDispatch {
  channel: 'SMS' | 'EMAIL';
  destination: string;
  purpose: string;
  challengeId: string;
}

export abstract class OtpAdapter {
  abstract send(dispatch: OtpDispatch, code: string): Promise<void>;
}
