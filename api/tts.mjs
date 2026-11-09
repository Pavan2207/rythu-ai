import { textToSpeech } from '../lib/gnani-api.mjs';

export default {
  fetch(request) {
    return textToSpeech(request);
  }
};