'use client';

import * as React from 'react';
import PhoneInput from 'react-phone-number-input';
import { cn } from '@/lib/utils';
import './phone-input.css';

export interface PhoneInputProps extends React.ComponentProps<typeof PhoneInput> {
  className?: string;
}

const PhoneInputComponent = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, onChange, value, ...props }, ref) => {
    return (
      <PhoneInput
        {...props}
        inputRef={ref}
        value={value}
        onChange={onChange}
        international
        withCountryCallingCode
        defaultCountry="TN"
        className={cn(
          'flex w-full rounded-md border border-input bg-background text-sm ring-offset-background',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          className
        )}
        numberInputProps={{
          className: cn(
            'flex h-10 w-full rounded-md border-0 bg-transparent px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50'
          ),
        }}
        countrySelectProps={{
          className: cn(
            'flex h-10 items-center gap-1.5 rounded-md border-0 bg-transparent text-sm',
            'focus-visible:outline-none cursor-pointer',
            'pl-3 pr-2'
          ),
        }}
      />
    );
  }
);

PhoneInputComponent.displayName = 'PhoneInput';

export { PhoneInputComponent as PhoneInput };
