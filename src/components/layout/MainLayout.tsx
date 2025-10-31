import { Navbar } from '@/components/navigation/Navbar';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </>
  );
}

