'use client';

import { useState } from 'react';
import { Button, FormField, TextArea } from '@world-pharma/ui-kit/web';

export function AdminConfirmAction(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  requireReason?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');

  if (!props.open) {
    return null;
  }

  return (
    <div className="wp-admin-palette-backdrop" role="presentation" onClick={props.onCancel}>
      <div
        className="wp-admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="wp-section-title">{props.title}</h2>
        <p className="wp-page-intro">{props.description}</p>
        {props.requireReason ? (
          <FormField label="Reason / justification">
            {({ id }) => (
              <TextArea
                id={id}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for audit trail"
              />
            )}
          </FormField>
        ) : null}
        <div className="wp-toolbar">
          <Button variant="secondary" onClick={props.onCancel} disabled={props.busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={props.busy || (props.requireReason && !reason.trim())}
            onClick={() => void props.onConfirm(reason.trim())}
          >
            {props.busy ? 'Working…' : (props.confirmLabel ?? 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
