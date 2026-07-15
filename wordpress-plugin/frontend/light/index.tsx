import { mount } from '../mount';
import LightApp from '../LightApp';

// Entry point of the Loopress Light (wordpress.org) edition bundle: this import graph
// never touches frontend/dependencies/, so the Light artifact ships none of the
// Composer UI. Lives in its own index.tsx so it shares an output filename with
// frontend/full/index.tsx, see the comment there.
mount(<LightApp />);
