import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/accept-invite'];

/** Presence check only; the API remains authoritative (TRD §11.3). */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie =
    request.cookies.has('opsdesk_access') || request.cookies.has('opsdesk_refresh');
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // No logged-in bounce away from /login: cookie presence cannot distinguish an
  // active session from a suspended one, and redirecting back would trap the user
  // when the API rejects the session (see ACCOUNT_NOT_ACTIVE handling client-side).
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
