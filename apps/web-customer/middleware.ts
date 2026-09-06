import { NextResponse, type NextRequest } from 'next/server';
import { findRedirect, parseSiteSeo, SITE_SEO_SLUG } from '@world-pharma/shared/site-chrome';
import { apiBaseUrl } from '@world-pharma/shell-core';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  try {
    const country = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'IN';
    const url = `${apiBaseUrl(process.env)}/api/v1/help/articles/${SITE_SEO_SLUG}?country_code=${encodeURIComponent(country)}&locale=en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return NextResponse.next();
    }
    const article = (await res.json()) as { body?: string };
    const seo = parseSiteSeo(article.body);
    const hit = findRedirect(pathname, seo.redirects);
    if (!hit) {
      return NextResponse.next();
    }
    const target = hit.to.startsWith('http') ? hit.to : new URL(hit.to, request.url);
    return NextResponse.redirect(target, hit.status);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
