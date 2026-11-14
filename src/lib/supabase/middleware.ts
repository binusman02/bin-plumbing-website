import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;
  const role = user
    ? ((user.app_metadata?.role as string | undefined) ||
        (user.user_metadata?.role as string | undefined))
    : undefined;

  const isAccessingAdmin = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const isAccessingCustomer = pathname.startsWith("/customer");
  const isAccessingPlumber = pathname.startsWith("/plumber");

  // Block unauthenticated access to protected /admin routes
  if (isAccessingAdmin && !isAdminLogin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
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
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
