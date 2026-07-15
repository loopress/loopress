import { mount } from './mount';
import FreeApp from './FreeApp';

// Entry point of the free (wordpress.org) edition bundle: this import graph never
// touches frontend/plus/, so the free artifact ships none of the Composer UI.
mount(<FreeApp />);
