/* WCAG 2.1 relative luminance and contrast ratio. Test-only: the app never computes contrast
   at runtime, so this lives with the tests rather than shipping in src/. */

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function parseHex(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const short = SHORT_HEX.exec(trimmed);

  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16)
    };
  }

  const long = LONG_HEX.exec(trimmed);

  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16)
    };
  }

  return null;
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);

  if (!rgb) {
    return null;
  }

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);

  if (a === null || b === null) {
    return null;
  }

  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

/* Reads a :root-style block out of tokens.css. Deliberately simple: it wants the declared
   custom properties, not a full CSS parse, and a stylesheet this file cannot read should fail
   the test rather than be worked around. */
export function readTokenBlock(css, selector) {
  const start = css.indexOf(selector);

  if (start === -1) {
    return null;
  }

  const open = css.indexOf('{', start);
  if (open === -1) {
    return null;
  }

  let depth = 0;
  let end = -1;

  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') {
      depth += 1;
    } else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  if (end === -1) {
    return null;
  }

  const body = css.slice(open + 1, end);
  const tokens = {};

  for (const line of body.split(';')) {
    const match = /(--[a-z0-9-]+)\s*:\s*([^;]+)/i.exec(line);
    if (match) {
      tokens[match[1]] = match[2].trim();
    }
  }

  return tokens;
}
