export async function POST(request: Request) {
  void request;
  const { NextResponse } = await import('next/server');
  return NextResponse.json(
    { error: 'Self-service signup is disabled. This web application is admin-only.' },
    { status: 403 }
  );
}
