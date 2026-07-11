'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  containerClassName?: string;
};

export function PasswordInput({ containerClassName, className, ...props }: PasswordInputProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  const maskPassword = () => {
    setIsRevealed(false);
  };

  return (
    <div className={cn('relative', containerClassName)}>
      <Input
        {...props}
        type={isRevealed ? 'text' : 'password'}
        className={cn('pe-11', className)}
      />
      <button
        type="button"
        aria-label={isRevealed ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsRevealed(true);
        }}
        onMouseUp={maskPassword}
        onMouseLeave={maskPassword}
        onTouchStart={(event) => {
          event.preventDefault();
          setIsRevealed(true);
        }}
        onTouchEnd={maskPassword}
        onTouchCancel={maskPassword}
      >
        {isRevealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </div>
  );
}