import { fetchMandi } from '../lib/gnani-api.mjs';

export default {
  fetch(request) {
    return fetchMandi(request);
  }
};
