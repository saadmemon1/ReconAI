'use client';
import { useAuth } from '@/components/auth-provider';
import { AuthForm } from '@/components/auth-form';
import { Dashboard } from '@/components/dashboard';

export default function Home() {
  const { authenticated, loading } = useAuth();

  if (loading) return null;
  if (!authenticated) return <AuthForm />;
  return <Dashboard />;
}
