import { speechToText } from '../lib/gnani-api.mjs';

export default {
  fetch(request) {
    return speechToText(request);
  }
};