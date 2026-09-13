export interface Environment {
  production: boolean;
  supabase: {
    url: string;
    anonKey: string;
  };
  apiBaseUrl: string;
}

export const environment: Environment = {
  production: true,
  supabase: {
    url: 'https://uexbbrhnpjfhibwxbvlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E'
  },
  apiBaseUrl: 'https://smartrepo-backend.onrender.com'
};
