import { Page, MgBtn } from '../src/ui/mg-ui';

export default function NotFound() {
  return (
    <Page>
      <div className="mg-empty-page">
        <span className="mg-empty-code">404</span>
        <h1 className="mg-page-title">Page not found</h1>
        <p className="mg-page-subtitle">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="mg-empty-actions">
          <MgBtn href="/">Go to Home</MgBtn>
          <MgBtn href="/help" variant="ghost">
            Help Centre
          </MgBtn>
        </div>
      </div>
    </Page>
  );
}
