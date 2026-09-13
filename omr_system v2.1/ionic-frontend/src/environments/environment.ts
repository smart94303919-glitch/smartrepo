/**
 * environment.ts
 * ===============
 * Points the Ionic app at the FastAPI backend (api_server.py).
 *
 * IMPORTANT: "localhost" means different things depending on where the app
 * is running:
 *   - Ionic dev server in a desktop browser -> http://localhost:8000 is fine
 *   - Android Emulator                      -> use http://10.0.2.2:8000
 *                                               (10.0.2.2 is the emulator's
 *                                               alias for the host machine)
 *   - Physical phone on the same Wi-Fi      -> use your computer's LAN IP,
 *                                               e.g. http://192.168.1.42:8000
 *   - Production                            -> your deployed API's HTTPS URL
 *
 * Swap `apiBaseUrl` below for your situation, or better, generate a second
 * environment.prod.ts (Angular does this automatically via `ng build
 * --configuration production`) so dev/prod never get mixed up.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000',
};
