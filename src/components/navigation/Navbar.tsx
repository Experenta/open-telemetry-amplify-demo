import Link from 'next/link';
import { getCurrentUserAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { BarChart3, FolderKanban } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';

export async function Navbar() {
  const { isAuthenticated, user } = await getCurrentUserAction();

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              ProjectHub
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  href="/projects"
                  className="flex items-center space-x-1 text-gray-700 hover:text-gray-900"
                >
                  <FolderKanban className="h-4 w-4" />
                  <span>Projects</span>
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-1 text-gray-700 hover:text-gray-900"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-600">
                  {user?.username || user?.userId}
                </span>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link href="/auth/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/auth/sign-up">
                  <Button size="sm">Sign up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

