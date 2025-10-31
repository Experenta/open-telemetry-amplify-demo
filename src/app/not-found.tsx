import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MainLayout } from '@/components/layout/MainLayout';

export default function NotFound() {
  return (
    <MainLayout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">
          Page Not Found
        </h2>
        <p className="text-gray-600 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/">
          <Button>Go Back Home</Button>
        </Link>
      </div>
    </MainLayout>
  );
}

