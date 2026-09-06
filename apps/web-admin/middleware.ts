import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PREFIXES = ['/login', '/health', '/api', '/_next', '/favicon.ico'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const cookieHeader = request.cookies
    .getAll()
    .map((row) => `${row.name}=${encodeURIComponent(row.value)}`)
    .join('; ');

  try {
    const bootstrapUrl = new URL('/api/v1/auth/bootstrap', request.nextUrl.origin);
    const res = await fetch(bootstrapUrl, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) {
      const login = request.nextUrl.clone();
      login.pathname = '/login';
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
    const body = (await res.json()) as { audience?: string };
    if (body.audience !== 'admin') {
      const denied = request.nextUrl.clone();
      denied.pathname = '/login';
      denied.searchParams.set('denied', '1');
      return NextResponse.redirect(denied);
    }
    return NextResponse.next();
  } catch {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
