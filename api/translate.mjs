import { translateText } from '../lib/gnani-api.mjs';

export const config = { maxDuration: 30 };

export default {
  fetch(request) {
    return translateText(request);
  }
};
