import { NextResponse, type NextRequest } from "next/server";

/* Redirection rapide vers /login sans cookie de session. La vérification réelle se fait côté serveur (requireUser). */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("lc_session")) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/|_next/|favicon.ico).*)"],
};
