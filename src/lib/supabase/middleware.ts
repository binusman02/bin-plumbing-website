import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getVerifiedAppRole } from "@/lib/auth-role";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAccessingAdmin = pathname.startsWith("/admin");
  const isAccessingCustomer = pathname.startsWith("/customer");
  const isAccessingPlumber = pathname.startsWith("/plumber");

  if (!isAccessingAdmin && !isAccessingCustomer && !isAccessingPlumber) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = getVerifiedAppRole(user);

  const isAdminLogin = pathname === "/admin/login";

  // Block unauthenticated access to protected /admin routes while preserving destination
  if (isAccessingAdmin && !isAdminLogin && !user) {
    const url = request.nextUrl.clone();
    const intended = `${pathname}${request.nextUrl.search}`;
    url.pathname = "/admin/login";
    url.search = "";
    if (intended && intended !== "/admin") {
      url.searchParams.set("redirect", intended);
    }
    url.searchParams.set("reason", "auth_required");
    return NextResponse.redirect(url);
  }

  // Enforce strict role separation when signed in
  if (user) {
    if (isAccessingAdmin && !isAdminLogin) {
      if (role === "customer" || role === "plumber") {
        const url = request.nextUrl.clone();
        url.pathname = role === "customer" ? "/customer" : "/plumber";
        return NextResponse.redirect(url);
      }

      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("id, role, is_active")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!adminRow) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
    }

    if (isAccessingCustomer && role === "plumber") {
      const url = request.nextUrl.clone();
      url.pathname = "/plumber";
      return NextResponse.redirect(url);
    }

    if (isAccessingPlumber && role === "customer") {
      const url = request.nextUrl.clone();
      url.pathname = "/customer";
      return NextResponse.redirect(url);
    }

    if (isAdminLogin && role !== "customer" && role !== "plumber") {
      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (adminRow) {
        const requestedRedirect = request.nextUrl.searchParams.get("redirect") || "";
        const safeTarget =
          requestedRedirect.startsWith("/admin") && !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : "/admin";
        return NextResponse.redirect(new URL(safeTarget, request.url));
      }
    }
  }

  return supabaseResponse;
}
