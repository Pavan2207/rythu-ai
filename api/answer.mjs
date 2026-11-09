import { evonAnswer } from '../lib/gnani-api.mjs';

export default {
  fetch(request) {
    return evonAnswer(request);
  }
};