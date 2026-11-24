import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { viewportZoom } from './postcss-viewport-zoom.js';

export default {
  plugins: [
    tailwindcss(),
    // After Tailwind, so the lengths of its utility classes are corrected too.
    viewportZoom(),
    autoprefixer(),
  ],
};
