import { mount } from '../mount';
import App from '../App';

// Entry point of the full edition bundle (and the dev default). Lives in its own
// index.tsx so it shares an output filename with frontend/light/index.tsx: whichever
// one was built or watched most recently is what build/index.tsx.js contains, which
// is the only file AdminPageModule.php ever enqueues (see scripts/build-flavor.cjs).
mount(<App />);
