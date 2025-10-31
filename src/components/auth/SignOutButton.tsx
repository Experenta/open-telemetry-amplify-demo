'use client';

import { signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut();
      toast.success('Signed out successfully');
      router.push('/auth/sign-in');
      router.refresh();
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
      <LogOut className="h-4 w-4 mr-2" />
      Sign out
    </Button>
  );
}

