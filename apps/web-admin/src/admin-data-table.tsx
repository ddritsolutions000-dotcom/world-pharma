'use client';

import type { ReactNode } from 'react';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';

export type AdminDataColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  hideOnMobile?: boolean;
};

export function AdminDataTable<T>(props: {
  caption: string;
  columns: AdminDataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  activeKey?: string;
}) {
  if (props.loading && props.rows.length === 0) {
    return <LoadingState label={`Loading ${props.caption.toLowerCase()}`} />;
  }
  if (props.error) {
    return <AdminRequestError error={props.error} onRetry={props.onRetry ?? (() => undefined)} />;
  }
  if (props.rows.length === 0) {
    return (
      <EmptyState
        title={props.emptyTitle ?? 'No records'}
        description={props.emptyDescription ?? 'Nothing matched the current filters.'}
      />
    );
  }

  return (
    <div className="wp-admin-table-wrap wp-admin-data-table">
      <table className="wp-table">
        <caption className="wp-sr-only">{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={col.hideOnMobile ? 'wp-hide-mobile' : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const key = props.rowKey(row);
            return (
              <tr
                key={key}
                className={props.activeKey === key ? 'wp-admin-row-active' : undefined}
              >
                {props.columns.map((col) => (
                  <td key={col.id} className={col.hideOnMobile ? 'wp-hide-mobile' : undefined}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
