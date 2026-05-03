import { NextResponse } from 'next/server';

import { getAllowedCustomers } from '@/lib/data/get-current-customer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getAllowedCustomers();

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error: 'unauthorized',
          customers: [],
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      customers: result.customers,
    });
  } catch (error) {
    console.error('Erro ao listar clientes permitidos:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
        customers: [],
      },
      { status: 500 },
    );
  }
}
