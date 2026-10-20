/**
 * ============================================================================
 * DevMeet Frontend - PostCSS Pipeline Configuration
 * ============================================================================
 * Coordinates CSS post-processing during Next.js compilation:
 * 1. Tailwind CSS Plugin: Scans template files to generate atomic utility classes.
 * 2. Autoprefixer: Automatically injects vendor prefixes (-webkit-, -moz-)
 *    ensuring cross-browser compatibility with target browser matrix.
 * ============================================================================
 */

module.exports = {
  plugins: {
    // Tailwind CSS processor
    tailwindcss: {},
    // Browser vendor prefix injector
    autoprefixer: {},
  },
};
