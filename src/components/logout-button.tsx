'use client';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-gray-500 underline"
      onClick={async () => {
        await apiPost('/api/auth/logout', {});
        router.push('/login');
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
