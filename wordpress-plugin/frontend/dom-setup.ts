// This file runs BEFORE test-setup.ts so that @testing-library/dom
// sees a valid document when it binds `screen` at module load time.
import { Window } from 'happy-dom';

const happyWindow = new Window({ url: 'http://localhost/' });

for (const key of Object.getOwnPropertyNames(happyWindow)) {
    if (key in globalThis) continue;
    try {
        const desc = Object.getOwnPropertyDescriptor(happyWindow, key);
        if (desc) Object.defineProperty(globalThis, key, { ...desc, configurable: true });
    } catch {}
}

(globalThis as any).window = happyWindow;
(globalThis as any).document = happyWindow.document;
