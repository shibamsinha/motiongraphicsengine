import { loadFont } from '@remotion/fonts';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { FONT_FACES, FONT_FAMILY } from './typography';

let ready = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

const announce = () => {
  ready = true;
  listeners.forEach((listener) => listener());
};

export const loadEngineFonts = (): Promise<void> => {
  if (ready) return Promise.resolve();
  if (!pending) {
    pending = Promise.all(
      FONT_FACES.map((face) =>
        loadFont({
          family: FONT_FAMILY,
          url: staticFile(face.file),
          weight: String(face.weight),
          style: 'normal',
          format: 'woff2',
        }),
      ),
    )
      .then(() => document.fonts.ready)
      .then(() => {
        announce();
      })
      .catch((error) => {
        console.error('[mge] font load failed', error);
        announce();
      });
  }
  return pending;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): boolean => ready;

export const useFontsReady = (): boolean => {
  const isReady = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [handle] = useState<number | null>(() =>
    ready ? null : delayRender('Loading typeface'),
  );

  useEffect(() => {
    let released = false;
    void loadEngineFonts().then(() => {
      if (released || handle === null) return;
      released = true;
      continueRender(handle);
    });
    return () => {
      if (released || handle === null) return;
      released = true;
      continueRender(handle);
    };
  }, [handle]);

  return isReady;
};
