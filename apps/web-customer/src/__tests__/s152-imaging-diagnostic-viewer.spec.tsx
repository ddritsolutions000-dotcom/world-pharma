/**
 * Sprint 152 — Customer diagnostic viewer panel (unit).
 */
import { render, screen } from '@testing-library/react';
import { ImagingDiagnosticViewerPanel } from '../imaging-diagnostic-viewer';

describe('S152 ImagingDiagnosticViewerPanel', () => {
  it('separates report vs images and shows loading/empty/error states', () => {
    const { rerender } = render(
      <ImagingDiagnosticViewerPanel
        session={null}
        loadState="loading"
        fetchFrameBlob={async () => new Blob()}
      />,
    );
    expect(screen.getByText(/Opening diagnostic viewer/i)).toBeTruthy();

    rerender(
      <ImagingDiagnosticViewerPanel
        session={null}
        loadState="empty"
        errorDetail="missing"
        fetchFrameBlob={async () => new Blob()}
      />,
    );
    expect(screen.getByText(/Study not viewable/i)).toBeTruthy();

    rerender(
      <ImagingDiagnosticViewerPanel
        session={null}
        loadState="forbidden"
        fetchFrameBlob={async () => new Blob()}
      />,
    );
    expect(screen.getByText(/You do not have access/i)).toBeTruthy();
  });

  it('renders study metadata and controls when ready (no public URL)', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const session = {
      imaging_study_id: 's1',
      imaging_booking_id: 'b1',
      study_instance_uid: '1.2.3',
      accession_number: 'ACC-1',
      modality_code: 'XR',
      study_description: 'Chest',
      study_date_time: null,
      sandbox: true,
      viewer: {
        available: true,
        certified_diagnostic_workstation: false,
        note: 'Sandbox diagnostic viewer',
        report_separate_from_viewer: true,
      },
      series: [
        {
          series_id: 'ser1',
          series_instance_uid: '1.2.3.4',
          series_number: 1,
          modality_code: 'XR',
          description: 'Series 1',
          frame_count: 2,
          instance_count: 1,
        },
      ],
      capabilities: {
        zoom: true,
        pan: true,
        rotate: true,
        reset: true,
        fit_to_screen: true,
        series_navigation: true,
        slice_navigation: true,
        fullscreen: true,
      },
    };

    render(
      <ImagingDiagnosticViewerPanel
        session={session}
        loadState="ready"
        reportHref="/radiology/bookings/b1"
        fetchFrameBlob={async () => new Blob([png], { type: 'image/png' })}
      />,
    );

    expect(screen.getByText(/Not a certified diagnostic workstation/i)).toBeTruthy();
    expect(screen.getByText(/View report/i)).toBeTruthy();
    expect(screen.getByText(/Zoom \+/i)).toBeTruthy();
    expect(screen.getByText(/Prev slice/i)).toBeTruthy();
    expect(screen.getByText(/no public URLs/i)).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/https?:\/\/.*\/private-objects/i);
  });
});
