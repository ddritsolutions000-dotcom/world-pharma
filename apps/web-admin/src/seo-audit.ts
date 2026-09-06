export type SeoContentRow = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  locale: string;
  content_type: string;
};

export type SeoIssue = {
  code: 'title_short' | 'title_long' | 'meta_short' | 'meta_long' | 'no_slug' | 'not_published';
  label: string;
};

export function seoIssuesFor(row: SeoContentRow): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const title = row.title.trim();
  const summary = row.summary.trim();
  if (title.length < 30) {
    issues.push({ code: 'title_short', label: 'Title under 30 characters' });
  }
  if (title.length > 60) {
    issues.push({ code: 'title_long', label: 'Title over 60 characters' });
  }
  if (summary.length < 70) {
    issues.push({ code: 'meta_short', label: 'Summary (meta) under 70 characters' });
  }
  if (summary.length > 160) {
    issues.push({ code: 'meta_long', label: 'Summary (meta) over 160 characters' });
  }
  if (!row.slug.trim()) {
    issues.push({ code: 'no_slug', label: 'Missing slug' });
  }
  if (row.status !== 'PUBLISHED') {
    issues.push({ code: 'not_published', label: 'Not published' });
  }
  return issues;
}
