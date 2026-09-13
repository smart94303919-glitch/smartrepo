// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export interface Environment {
  production: boolean;
  supabase: {
    url: string;
    anonKey: string;
  };
  apiBaseUrl: string;
}

export const environment: Environment = {
  production: false,
  supabase: {
    url: 'https://uexbbrhnpjfhibwxbvlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E'
  },
  apiBaseUrl: 'https://smartrepo-backend.onrender.com'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
