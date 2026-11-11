import { fetchWeather } from '../lib/gnani-api.mjs';

export default {
  fetch(request) {
    return fetchWeather(request);
  }
};
