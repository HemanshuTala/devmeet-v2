'use client';

import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';

interface PageLoaderProps {
  label?: string;
  className?: string;
}

export function PageLoader({ label = 'Loading...', className }: PageLoaderProps) {
  return (
    <div className={cn('min-h-[400px] w-full flex flex-col items-center justify-center p-8', className)}>
      <Loader size="lg" text={label} />
    </div>
  );
}
