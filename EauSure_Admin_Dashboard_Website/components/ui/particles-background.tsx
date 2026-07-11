'use client';

import { useEffect, useMemo, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';
import { useTheme } from 'next-themes';

export function ParticlesBackground() {
  const [init, setInit] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const lowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowCores = navigator.hardwareConcurrency;

    if (reducedMotion.matches) {
      setEnabled(false);
      return;
    }

    if (typeof lowMemory === 'number' && lowMemory <= 2) {
      setEnabled(false);
      return;
    }

    if (typeof lowCores === 'number' && lowCores <= 2) {
      setEnabled(false);
      return;
    }

    if (coarsePointer.matches && window.innerWidth < 768) {
      setEnabled(false);
      return;
    }

    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setEnabled(false);
    };
    reducedMotion.addEventListener('change', onChange);
    return () => reducedMotion.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (!cancelled) setInit(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const options: ISourceOptions = useMemo(() => {
    const isDark = resolvedTheme === 'dark';
    const color = isDark ? '#60a5fa' : '#3b82f6';

    return {
      background: { color: { value: 'transparent' } },
      fpsLimit: 30,
      pauseOnBlur: true,
      pauseOnOutsideViewport: true,
      particles: {
        color: { value: color },
        links: {
          color,
          distance: 140,
          enable: true,
          opacity: isDark ? 0.25 : 0.18,
          width: 1,
        },
        move: {
          direction: 'top',
          enable: true,
          outModes: { default: 'out' },
          speed: 0.4,
          straight: false,
        },
        number: {
          density: { enable: true, width: 1920, height: 1080 },
          value: 24,
        },
        opacity: { value: isDark ? 0.45 : 0.35 },
        shape: { type: 'circle' },
        size: { value: { min: 1.5, max: 3 } },
      },
      detectRetina: false,
    };
  }, [resolvedTheme]);

  if (!enabled || !init) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ willChange: 'transform', contain: 'strict' }}
    >
      <Particles id="tsparticles-background" options={options} className="h-full w-full" />
    </div>
  );
}
