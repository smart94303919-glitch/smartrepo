# Master Prompt: Remove the Manual Backend Startup Requirement

Act as a senior Ionic, Angular, Capacitor, FastAPI, and mobile deployment engineer. Work directly in this repository and solve the backend startup and API connectivity problem end to end.

## Problem

To use the OMR system during development, I currently have to open a separate terminal and run:

```powershell
cd "backend"
..\.venv\Scripts\uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

The Ionic application calls the FastAPI backend through the API base URL configured in `src/environments/environment.ts` and the shared client in `src/app/services/omr-api.service.ts`. The root `package.json` already contains startup scripts, but they may not match the actual `.venv` and `uvicorn` setup.

I need an alternative that does not require me to manually type the backend command every time. The application will eventually be exported as a Capacitor Android/iOS mobile application, so do not assume that `localhost:8000` on a phone means the developer computer.

## Repository facts to verify before editing

- The main Ionic project is the repository root.
- The backend entry point is `backend/api_server.py` and exposes `app`.
- The backend is normally started with `uvicorn api_server:app` from the `backend` directory.
- The Python virtual environment currently used by the manual command is `backend/.venv`.
- The Angular API client is `src/app/services/omr-api.service.ts`.
- The development API URL is currently `http://localhost:8000`.
- Capacitor configuration is in `capacitor.config.ts` and the web output is `www`.
- There is a root `package.json` with frontend/backend startup scripts. Inspect it instead of assuming its existing scripts are correct.
- Do not use the old `omr_system v2.1` frontend or server unless the current root project explicitly depends on it.

## Required investigation

1. Inspect the current root `package.json`, Angular environment files, `capacitor.config.ts`, `backend/api_server.py`, backend requirements, and relevant API service usage.
2. Determine whether the current failure is only a startup-script/path problem, an API URL problem, or both.
3. Check whether the repository has a documented Python setup and whether `.venv` is expected to be created automatically.
4. Check the FastAPI CORS configuration and the `/health` endpoint.
5. Explain clearly which solution applies to:
   - local web development with `ionic serve`;
   - a physical phone connected to the same network during development;
   - a production Android/iOS build.

## Implementation goal

Implement the smallest reliable solution that removes the manual backend command for local development. Prefer a root command such as `npm start` or `npm run dev` that starts both Ionic and FastAPI, waits for neither process to silently fail, and uses the correct Windows and cross-platform paths. Preserve useful process output and terminate both processes together.

Also make the API base URL configurable by build/deployment target. Do not leave a production mobile build pointing to `localhost:8000` unless the chosen architecture genuinely runs the API inside the device. Use environment configuration or an equivalent Capacitor-safe configuration, and add a clear health/connectivity failure message where appropriate.

## Mobile architecture requirement

Do not pretend that starting a desktop Python process solves production mobile deployment. Compare these options and recommend one based on the existing codebase:

1. Deploy FastAPI as a hosted HTTPS service and configure the mobile app with that URL.
2. Run the backend on a developer computer for device testing and configure the phone to use the computer's LAN IP, with proper host binding and CORS.
3. Package/run Python locally on Android/iOS only if the repository already supports a native embedded Python runtime; otherwise explain the additional native complexity and do not introduce it casually.

The selected implementation must not expose secrets in the frontend. Keep existing Supabase configuration behavior unchanged unless a change is required for this task.

## Editing and validation rules

- Make the changes directly in the repository; do not only provide pseudocode.
- Keep the public API endpoints and existing Angular service methods intact.
- Prefer existing dependencies. Add a dependency only when necessary and update `package.json` accordingly.
- Do not hard-code a machine-specific absolute path.
- Support Windows development, and keep scripts usable on macOS/Linux where practical.
- If a Python virtual environment or dependency is missing, provide the exact setup command and make the startup failure actionable.
- Add or update concise documentation with the commands for web development, LAN device testing, and production configuration.
- Do not commit changes.

## Acceptance criteria

- From the repository root, one documented command starts the Ionic frontend and FastAPI backend without manually changing into `backend` or typing the uvicorn command.
- The command uses `backend/.venv` when it exists and reports a useful error when it does not.
- `GET /health` is reachable from the frontend in local development.
- The frontend URL is configurable for localhost, a LAN IP, and a hosted HTTPS API.
- The solution does not claim that `localhost` will work from a physical phone.
- `npm run build` (or the project’s correct production build command) still succeeds.
- Run the most relevant available tests or checks and report their results.

## Response format

After making the changes, report:

1. Root cause found.
2. Files changed and why.
3. Exact commands for local web use.
4. Exact configuration needed for a physical phone.
5. Production mobile recommendation.
6. Validation performed and any remaining limitation.