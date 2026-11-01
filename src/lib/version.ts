/**
 * Single source of truth for the app version.
 *
 * release-please bumps `version` in package.json as part of the release PR —
 * the runtime always reads it from there, so the health endpoint, the UI and
 * the release artifacts can never drift apart. Do NOT hardcode versions
 * anywhere else; import APP_VERSION instead.
 */
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
