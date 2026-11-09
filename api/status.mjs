import { getStatus } from '../lib/gnani-api.mjs';

export default {
  fetch() {
    return getStatus();
  }
};