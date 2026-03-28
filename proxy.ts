import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api/protected(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowGroupApisInProduction = process.env.ENABLE_GROUP_APIS_IN_PRODUCTION === 'true';
  const allowTestRoutesInProduction = process.env.ENABLE_TEST_ROUTES_IN_PRODUCTION === 'true';

  if (
    isProduction &&
    !allowGroupApisInProduction &&
    req.nextUrl.pathname.startsWith('/api/groups')
  ) {
    return new Response('Not Found', { status: 404 });
  }

  if (
    isProduction &&
    !allowTestRoutesInProduction &&
    (req.nextUrl.pathname.startsWith('/tests') || req.nextUrl.pathname.startsWith('/api/tests'))
  ) {
    return new Response('Not Found', { status: 404 });
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};