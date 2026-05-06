import { redirect } from 'next/navigation';

import { ChangePasswordPanel } from '@/components/ChangePasswordPanel';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProfilePasswordRow = {
  must_change_password: boolean | null;
};

export default async function ChangePasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('must_change_password')
    .eq('id', user.id)
    .maybeSingle<ProfilePasswordRow>();

  if (!profile?.must_change_password) {
    redirect('/dashboard');
  }

  return <ChangePasswordPanel />;
}
